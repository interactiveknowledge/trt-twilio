const express = require('express')
const { MessagingResponse } = require('twilio').twiml
const bodyParser = require('body-parser')
const { getNumberDbCount, hasValidZipCode, parseZipCode } = require('./utilities.js')

// Redis
const redis = require('redis')
const redisUrl = process.env.REDISCLOUD_URL || 'redis://localhost:6379'
const client = redis.createClient(redisUrl)
client.connect().catch(err => {
  console.error('Redis connection error:', err)
})

client.on('error', (err) => {
  console.error('Redis client error:', err)
})

// Handler for incoming messages.
const incomingMessageHandler = async (req, res) => {
  const twiml = new MessagingResponse()
  const messageBody = req.body.Body
  const from = req.body.From
  const count = await getNumberDbCount(from)

  if (messageBody === 'LOCATE') {
    twiml.message('We can do that! This is The Right Time clinic finder. Please send your zip code to find a clinic near you.')
  }
  else if (messageBody = 'STATS') {
    twiml.message(`You have sent ${count + 1} messages to this number.`)
  }
  else if (messageBody === 'GEO') {
    const fromCity = req.body.FromCity
    const fromState = req.body.FromState
    const fromZip = req.body.FromZip
    const fromCountry = req.body.FromCountry

    twiml.message(`Your location is ${fromCity}, ${fromState}, ${fromZip}, ${fromCountry}.`)
  }
  else if (hasValidZipCode(messageBody) === true) {
    const zipCode = parseZipCode(messageBody)
    twiml.message(`Thanks! We found a clinic near you. The zip code you provided is ${zipCode}.`)
  }

  // Count the number.
  client.set(from, count + 1)

  res.type('text/xml').send(twiml.toString())
}

// Set up server.
const app = express()

app.use(bodyParser.urlencoded({ extended: false }))

app.post('/sms', incomingMessageHandler)

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`Server READY. Listening on port ${port}.`)
})
