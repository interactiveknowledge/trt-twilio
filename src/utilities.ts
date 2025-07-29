import fs from 'fs'
import path from 'path'
import axios, { AxiosResponse } from 'axios'
import { CsvParserStream, parse } from '@fast-csv/parse'
import { EndUserLocation } from './interfaces/EndUserLocation'
import { Clinic } from './interfaces/Clinic'
import { ZipCode } from './interfaces/ZipCode'

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
 * Get the count of messages sent from a number.
 */
export const getNumberDbCount = async (redisClient: any, number: string): Promise<number> => {
  let dbCount = await redisClient.get(number, (err: Error, value: number) => value || 0)

  if (dbCount === null) {
    dbCount = 0
  }

  if (typeof dbCount === 'string') {
    dbCount = parseInt(dbCount)
  }

  return dbCount
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
