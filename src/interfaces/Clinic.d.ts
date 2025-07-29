/**
 * Description of the Clincs from Bedsider API response.
 */
export interface Clinic {
  id: number,
  name: string,
  address_1: string,
  address_2: string,
  city: string,
  state: string,
  zip: string,
  country: string,
  phone: string,
  miles_from_query_location: number,
  url: string,
  formatted_url: string,
}