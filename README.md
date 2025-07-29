# TRT Twilio Clinic Finder

## What is?

A transactional messaging app that returns a nearby clinic to the end-user based on their location. Handles messaging delivered from [Twilio](https://console.twilio.com). Twilio also delivers location information with the message that can be used to assume the end-user's location although the app can also parse a 5-digit ZIP code.

The app is designed to replicate behavior on [therighttime.org](http://therighttime.org/where-to-get-birth-control/health-centers). This includes limiting results to the state of Missouri, USA.

## Setup and development

Written in Node.js and Typescript.

- Install and use the version of nodejs pinned in `package.json`
- `npm install`
- Install [Redis](https://formulae.brew.sh/formula/redis#default) or [valkey](https://formulae.brew.sh/formula/valkey#default) to support tracking end-user messages and state.
- Configure `.env` for local development. This includes getting a [bedsider.org](https://bedsider.org) API key to use the Clinic Finder tool.
- `npm run dev` to start server.

`dev` exposes the `/dev/sms` endpoint which can be used to test the application without using a SMS or Twilio phone number. Use an API testing tool to POST the information over JSON.

## Production and deployment

Designed to deploy to Heroku or any platform which can host a Node.JS server.

`npm run build` exports the app to `dist/` directory.

Node should be configured to run the `dist/server.js` file.
