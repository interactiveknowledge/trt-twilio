import fs from 'fs'
import path from 'path'
import axios, { AxiosResponse } from 'axios'
import { CsvParserStream, parse } from '@fast-csv/parse'
import { EndUserLocation } from './interfaces/EndUserLocation'
import { Clinic } from './interfaces/Clinic'
import { ZipCode } from './interfaces/ZipCode'
import { EndUser } from './interfaces/EndUser'

/**
/**
 * Get the 5 digit zip code from the message.
 */
export const parseZipCode = (message: string): string => {
  const zipCodePattern = /\d{5}/
  if (zipCodePattern.test(message)) {
    const numberMatches = message.match(/\d{5}/g)

    if (numberMatches === null || numberMatches.length === 0) {
      return ''
    }
    else {
      return numberMatches[0]
    }
  }

  return ''
}

/**
 * Check if the message contains a 5 digit zip code.
 *
 * @param {string} message
 * @returns boolean
 */
export const hasValidZipCode = (message: string) => {
  if (typeof message !== 'string') {
    return false
  }

  return parseZipCode(message).length > 0
}

/**
 * Get EndUser data from redis. If not found then create a new EndUser object.
 */
export const getEndUserData = async (redisClient: any, user: string): Promise<EndUser> => {
  let endUserString = await redisClient.get(user, (err: Error, value: string) => value || null)
  let endUser: EndUser

  if (endUserString === null) {
    endUser = {
      id: user,
      count_messages_received: 0,
      rolling_count_messages_received: 0,
      count_api_requests: 0,
      first_message_date: Date.now(),
      rolling_message_date: Date.now(),
      last_message_date: 0
    }
  }
  else {
    endUser = JSON.parse(endUserString)
  }

  return endUser
}

/**
 * Set EndUser data into redis.
 */
export const setEndUserData = async (redisClient: any, user: string, endUser: EndUser) => {
  await redisClient.set(user, JSON.stringify(endUser))
}

/**
 * Build a location object.
 */
export const buildLocationObject = (
  fromCity: string,
  fromState: string,
  fromZip: string,
  fromCountry: string
): EndUserLocation => {
  return {
    city: fromCity,
    state: fromState,
    zip: fromZip,
    country: fromCountry
  }
}

/**
 * Given the end-user ZIP make a bedsider request.
 */
export const makeBedsiderApiRequest = async (zip: string): Promise<{ clinics: Clinic[] }> => {
  let radius = 60
  let page = 1
  let perPage = 5
  let location = zip
  const apiKey = process.env.BEDSIDER_API_KEY
  const apiUrl = `https://www.bedsider.org/api/clinics/v4?api_key=${apiKey}&page=${page}&radius=${radius}&location=${location}&per_page=${perPage}`
  const response = await axios.get(apiUrl)
  return response.data
}

/**
 * Creates the parser.
 */
export const createZipCodeParser = (zipCodes: ZipCode[]): CsvParserStream<any, ZipCode> => {
  const parser = fs.createReadStream(path.join(__dirname, '../files/ZIP_Locale_Detail.csv'))
    .pipe(parse({
      headers: true,
      objectMode: true,
    }))

  parser.on('data', (record: ZipCode) => {
    zipCodes.push(record)
  })

  return parser
}

/**
 * Get the state associated with the zip code.
 */
export const getZipCodeState = (zip: string, zipCodes: ZipCode[]): string => {
  let search = true
  let row = 0

  while (search) {
    if (zipCodes[row]['PHYSICAL ZIP'] === zip) {
      search = false
      return zipCodes[row]['PHYSICAL STATE']
    }

    row++
  }

  return ''
}

/**
 * Check if the zip code is in Missouri.
 */
export const isZipCodeInMissouri = (zip: string, zipCodes: ZipCode[]): boolean => {
  return getZipCodeState(zip, zipCodes) === 'MO'
}

/**
 * Check message limits so that abuse is prevented. Return true if within limits.
 */
export const isEndUserWithinMessageLimits = (endUser: EndUser): boolean => {
  // 20 per day.
  if (endUser.rolling_count_messages_received < 20) {
    return true
  }

  const now = Date.now()
  const period = now - endUser.rolling_message_date
  const rollingAverage = period / endUser.rolling_count_messages_received

  // Limit to 20 per day 86400000 / 20
  if (rollingAverage < 4320000) {
    return false
  }

  return true
}