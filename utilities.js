/**
 * Get the 5 digit zip code from the message.
 *
 * @param {string} message
 * @returns string
 */
export const parseZipCode = message => {
  const zipCodePattern = /\d{5}/
  if (zipCodePattern.test(message.toString())) {

    const numbers = message.toString().match(/\d{5}/g).pop()

    return numbers
  }

  return ''
}

/**
 * Check if the message contains a 5 digit zip code.
 *
 * @param {string} message
 * @returns boolean
 */
export const hasValidZipCode = message => {
  return parseZipCode(message).length > 0
}
