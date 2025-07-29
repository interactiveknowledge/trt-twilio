import express, { response } from 'express'
import MessagingResponse from 'twilio/lib/twiml/MessagingResponse'
import dotenv from 'dotenv'
dotenv.config()
import bodyParser from 'body-parser'
import { buildLocationObject, makeBedsiderApiRequest, getNumberDbCount, hasValidZipCode, parseZipCode, createZipCodeParser, getZipCodeState, isZipCodeInMissouri } from './utilities'
import parsePhoneNumberFromString from 'libphonenumber-js'
import { createClient } from 'redis'
import { EndUserLocation } from './interfaces/EndUserLocation'
import { ZipCode } from './interfaces/ZipCode'

// Redis/valkey setup.
const redisUrl = process.env.REDISCLOUD_URL || 'redis://localhost:6379'
let valKeyConnected = false
const client = createClient({
  url: redisUrl
})
client.connect()
  .then(() => {
    console.log('Redis/Valkey connected.')
    valKeyConnected = true
  })
  .catch((err: Error) => {
  console.error('Redis/Valkey connection error:', err)
  valKeyConnected = false
})

// Prepare ZIP codes.
let zipCodesReady = false
const zipCodes: ZipCode[] = []
createZipCodeParser(zipCodes)
  .on('end', (rowCount: string) => {
    console.log(`Parsed ${rowCount} ZIP codes.`)
    zipCodesReady = true
  })
  .on('error', (error) => console.error(error))

// Handle incoming messages and determine appropriate response.
const handleMessage = async (
  messageBody: string,
  messageFrom: string,
  location: EndUserLocation,
) => {
    const twiml = new MessagingResponse()
    let messages = []

    // Get the number of messages this end-user has sent.
    let count = 0
    if (valKeyConnected === true) {
      count = await getNumberDbCount(client, messageFrom)
      client.set(messageFrom, count + 1)
    }

    console.log(`From: ${messageFrom}, Message: ${messageBody}`)

    // Determine the appropriate response based on keyword.
    if (messageBody === 'LOCATE' || messageBody === 'FIND') {
      if (isZipCodeInMissouri(location.zip, zipCodes) === false) {
        messages.push(`Your number is not tied to a Missouri location. We only provide lists of clinics in that state. Provide a Missouri 5-digit ZIP to find the closest clinic near you.`)
      }
      else {
        const responseData = await makeBedsiderApiRequest(location.zip)
        const { clinics } = responseData
        if (clinics.length > 0) {
          // Sort clinics by miles_from_query_location then return the closest.
          clinics.sort((a: any, b: any) => a.miles_from_query_location - b.miles_from_query_location)
          const closestClinic = clinics[0]
          const phoneNumber = parsePhoneNumberFromString(closestClinic.phone, {
            defaultCountry: 'US',
            defaultCallingCode: '1'
          })
          messages.push(`We found a nearby clinic to your location ${location.zip}: ${closestClinic.name} in ${closestClinic.city}, ${closestClinic.state}. ${phoneNumber?.formatNational()}. If this location is not correct reply with a closer 5-digit ZIP code.`)
        }
      }
    }
    else if (messageBody === 'STATS') {
      if (valKeyConnected === true) {
        twiml.message(`You have sent ${count + 1} messages to this number.`)
      }
      else {
        twiml.message(`Server is not tracking the number of messages you've sent.`)
      }
    }
    else if (messageBody === 'GEO') {
      messages.push(`Your location is ${location.city}, ${location.state}, ${location.zip}, ${location.country}.`)
    }
    else if (hasValidZipCode(messageBody) === true) {
      const zipCode = parseZipCode(messageBody)
      if (isZipCodeInMissouri(zipCode, zipCodes) === true) {
        const responseData = await makeBedsiderApiRequest(zipCode)
        const { clinics } = responseData
        if (clinics.length > 0) {
          // Sort clinics by miles_from_query_location then return the closest.
          clinics.sort((a: any, b: any) => a.miles_from_query_location - b.miles_from_query_location)
          const closestClinic = clinics[0]
          const phoneNumber = parsePhoneNumberFromString(closestClinic.phone, {
            defaultCountry: 'US',
            defaultCallingCode: '1'
          })
          messages.push(`We found a nearby clinic to your location ${zipCode}: ${closestClinic.name} in ${closestClinic.city}, ${closestClinic.state}. ${phoneNumber?.formatNational()}.`)
        }   
      }
    }

    messages.forEach(message => {
      console.log('message:', message)
      twiml.message(message)
    })

    return twiml.toString()
  }

// Handler for incoming messages.
const incomingMessageController = async (req: any, res: any) => {
  const body = req.body.Body
  const from = req.body.From
  const location = buildLocationObject(req.body.FromCity, req.body.FromState, req.body.FromZip, req.body.FromCountry)
  const twimlString = await handleMessage(body, from, location)
  res.type('text/xml').send(twimlString)
}

const incomingMessageControllerDev = async (req: any, res: any) => {
  const messageBody = req.body.message
  const from = req.body.from || ''
  const twimlString = await handleMessage(messageBody, from, req.body.location)
  res.type('text/xml').send(twimlString)
}

// Set up server.
const app = express()

// SMS endpoint for Twilio.
app.use(bodyParser.urlencoded({ extended: false }))
app.post('/sms', incomingMessageController)

// Endpoint for local development requests.
if (process.env.NODE_ENV === 'development') {
  console.log('Development mode enabled.')
  app.use(express.json())
  app.post('/dev/sms', incomingMessageControllerDev)
}

if (!process.env.BEDSIDER_API_KEY) {
  console.error('Error: No Bedsider.org API key found to search for clinics.')
}
else {
  const port = process.env.PORT || 3000
  app.listen(port, () => {
    console.log(`Server READY. Listening on port ${port}.`)
  })
}
