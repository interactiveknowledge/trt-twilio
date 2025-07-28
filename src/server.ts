const express = require('express')
const { MessagingResponse } = require('twilio').twiml
const bodyParser = require('body-parser')
const { getNumberDbCount, hasValidZipCode, parseZipCode } = require('./utilities.ts')

// Redis
const redis = require('redis')
const redisUrl = process.env.REDISCLOUD_URL || 'redis://localhost:6379'
console.log('redisUrl:', redisUrl)
const client = redis.createClient(redisUrl)
client.connect().catch((err: Error) => {
  console.error('Redis connection error:', err)
})

const handleMessage = async (
  messageBody: string,
  messageFrom: string,
  fromCity: string,
  fromState: string,
  fromZip: string,
  fromCountry: string
) => {
    const twiml = new MessagingResponse()
    let messages = []

    // const count = await getNumberDbCount(client, from)

    console.log(`From: ${messageFrom}, Message: ${messageBody}`)

    if (messageBody === 'LOCATE') {
      messages.push('We can do that! This is The Right Time clinic finder. Please send your zip code to find a clinic near you.')
    }
    else if (messageBody === 'STATS') {
      // twiml.message(`You have sent ${count + 1} messages to this number.`)
    }
    else if (messageBody === 'GEO') {
      messages.push(`Your location is ${fromCity}, ${fromState}, ${fromZip}, ${fromCountry}.`)
    }
    else if (messageBody === 'TWO') {
      messages.push('I can do that!')
      messages.push('This is the second message part.')
    }
    else if (hasValidZipCode(messageBody) === true) {
      const zipCode = parseZipCode(messageBody)
      messages.push(`Thanks! We found a clinic near you. The zip code you provided is ${zipCode}.`)
    }

    // Count the number.
    // client.set(from, count + 1)

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
  const fromCity = req.body.FromCity || ''
  const fromState = req.body.FromState || ''
  const fromZip = req.body.FromZip || ''
  const fromCountry = req.body.FromCountry || ''
  const twimlString = await handleMessage(body, from, fromCity, fromState, fromZip, fromCountry)
  res.type('text/xml').send(twimlString)
}

const incomingMessageControllerDev = async (req: any, res: any) => {
  const messageBody = req.body.message
  const from = req.body.from || {}
  const twimlString = await handleMessage(messageBody, from, '', '', '', '')
  res.type('text/xml').send(twimlString)
}

// Set up server.
const app = express()
app.use(express.json())

app.use(bodyParser.urlencoded({ extended: false }))

app.post('/sms', incomingMessageController)
app.post('/dev/sms', incomingMessageControllerDev)

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`Server READY. Listening on port ${port}.`)
})
