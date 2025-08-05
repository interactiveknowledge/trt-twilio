import express, { response } from 'express'
import MessagingResponse from 'twilio/lib/twiml/MessagingResponse'
import dotenv from 'dotenv'
dotenv.config()
import bodyParser from 'body-parser'
import { buildLocationObject, makeBedsiderApiRequest, hasValidZipCode, parseZipCode, createZipCodeParser, isZipCodeInMissouri, getEndUserData, setEndUserData, isEndUserWithinMessageLimits, getClinicFormattedUrl } from './utilities'
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

    // Delete all keys.
    client.flushDb()
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

    // Get or set up EndUser data.
    const endUser = await getEndUserData(client, messageFrom)
    endUser.count_messages_received++
    endUser.rolling_count_messages_received++
    endUser.last_message_date = Date.now()

    // If it has been more than 1 day since interaction then reset rolling_message_date and rolling_count_messages_received
    if (Date.now() - endUser.rolling_message_date > 86400000) {
      endUser.rolling_message_date = Date.now()
      endUser.rolling_count_messages_received = 1
    }

    // Check limits to prevent abuse.
    if (isEndUserWithinMessageLimits(endUser) === false) {
      return ''
    }

    console.log(`From: ${messageFrom}, Message: ${messageBody}`)

    // Determine the appropriate response based on keyword.
    if (
      messageBody.toLowerCase().includes('locate') === true ||
      messageBody.toLowerCase().includes('find') === true
    ) {
      let currentZipCode: string = location.zip

      // If a ZIP Code is found it the message then use it.
      if (hasValidZipCode(messageBody) === false) {
        currentZipCode = parseZipCode(messageBody)
      }

      if (isZipCodeInMissouri(currentZipCode, zipCodes) === false) {
        messages.push(`Please provide a Missouri 5-digit zip to find the closest clinic to you.`)
      }
      else {
        const responseData = await makeBedsiderApiRequest(currentZipCode)
        endUser.count_api_requests++

        const { clinics } = responseData
        if (clinics.length > 0) {
          // Sort clinics by miles_from_query_location then return the closest.
          clinics.sort((a: any, b: any) => a.miles_from_query_location - b.miles_from_query_location)
          const closestClinic = clinics[0]
          const phoneNumber = parsePhoneNumberFromString(closestClinic.phone, {
            defaultCountry: 'US',
            defaultCallingCode: '1'
          })
          const formattedUrl = getClinicFormattedUrl(closestClinic)
          messages.push(`We found a nearby clinic to your location ${currentZipCode}: ${closestClinic.name}. ${phoneNumber?.formatNational()}.${formattedUrl} If this location is not correct reply with a closer 5-digit ZIP code.`)

          // Offer option to find next closest clinic.
          if (clinics.length > 1) {
            endUser.next_closest = clinics[1]
            messages.push(`Would you like to see the next closest clinic? Reply "Y"`)
          }
        }
      }
    }
    else if (hasValidZipCode(messageBody) === true) {
      const zipCode = parseZipCode(messageBody)
      if (isZipCodeInMissouri(zipCode, zipCodes) === true) {
        const responseData = await makeBedsiderApiRequest(zipCode)
        endUser.count_api_requests++

        const { clinics } = responseData
        if (clinics.length > 0) {
          // Sort clinics by miles_from_query_location then return the closest.
          clinics.sort((a: any, b: any) => a.miles_from_query_location - b.miles_from_query_location)
          const closestClinic = clinics[0]
          const phoneNumber = parsePhoneNumberFromString(closestClinic.phone, {
            defaultCountry: 'US',
            defaultCallingCode: '1'
          })
          const formattedUrl = getClinicFormattedUrl(closestClinic)
          messages.push(`We found a nearby clinic to your location ${zipCode}: ${closestClinic.name}. ${phoneNumber?.formatNational()}.${formattedUrl}`)
        
          // Offer option to find next closest clinic.
          if (clinics.length > 1) {
            endUser.next_closest = clinics[1]
            messages.push(`Would you like to see the next closest clinic? Reply "Y"`)
          }
        }   
      }
      else {
        messages.push('That is not a valid Missouri ZIP code.')
      }
    }
    else if (messageBody.toLowerCase() === 'y' && endUser.next_closest) {
      const nextClosest = endUser.next_closest
      const phoneNumber = parsePhoneNumberFromString(nextClosest.phone, {
        defaultCountry: 'US',
        defaultCallingCode: '1'
      })
      const formattedUrl = getClinicFormattedUrl(nextClosest)
      messages.push(`The next closest clinic: ${nextClosest.name}. ${phoneNumber?.formatNational()}.${formattedUrl}`)
    
      // reset.
      endUser.next_closest = null
    }

    // Set user data.
    setEndUserData(client, messageFrom, endUser)

    messages.forEach(message => {
      console.log('message:', message)
      twiml.message(message)
    })

    return twiml.toString()
  }

// Handler for incoming messages.
const incomingMessageController = async (req: any, res: any) => {
  if (valKeyConnected && zipCodesReady) {
    const body = req.body.Body
    const from = req.body.From
    const location = buildLocationObject(req.body.FromCity, req.body.FromState, req.body.FromZip, req.body.FromCountry)
    const twimlString = await handleMessage(body, from, location)
    res.type('text/xml').send(twimlString)
  }
  else {
    res.type('text/xml').send('<Response></Response>')
  }
}

const incomingMessageControllerDev = async (req: any, res: any) => {
  if (valKeyConnected && zipCodesReady) {
    const messageBody = req.body.message
    const from = req.body.from || ''
    const twimlString = await handleMessage(messageBody, from, req.body.location)
    res.type('text/xml').send(twimlString)
  }
  else {
    res.type('text/xml').send('<Response></Response>')
  }
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
