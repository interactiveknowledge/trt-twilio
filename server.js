const express = require('express')
const { MessagingResponse } = require('twilio').twiml
const bodyParser = require('body-parser')
const { hasValidZipCode, parseZipCode } = require('./utilities.js')
const redis = require('redis')
const redisUrl = process.env.REDISCLOUD_URL || 'redis://localhost:6379'
const client = redis.createClient(redisUrl)

// Handler for incoming messages.
const incomingMessageHandler = (req, res) => {
  // Get message body.
  const messageBody = req.body.Body
  const twiml = new MessagingResponse()
  const from = req.body.From

  if (messageBody === 'LOCATE') {
    twiml.message('We can do that! This is The Right Time clinic finder. Please send your zip code to find a clinic near you.')
  }
  else if (messageBody = 'STATS') {
    client.get(from, (err, value) => {
      twiml.message(`You have sent ${parseInt(value) + 1} messages to us.`)
    })
  }
  else if (hasValidZipCode(messageBody) === true) {
    const zipCode = parseZipCode(messageBody)
    twiml.message(`Thanks! We found a clinic near you. The zip code you provided is ${zipCode}.`)
  }

  res.type('text/xml').send(twiml.toString())

  // Increment the message count for the user.
  client.get(from, (err, value) => {
    if (err) {
      console.error(err)
      return
    }

    const count = parseInt(value) + 1
    client.set(from, count)
  })
}

// Set up server.
const app = express()

app.use(bodyParser.urlencoded({ extended: false }))

app.post('/sms', incomingMessageHandler)

const port = process.env.PORT || 3000
app.listen(port, () => {
  console.log(`Server READY. Listening on port ${port}.`)
})
