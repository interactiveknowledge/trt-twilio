import { Clinic } from "./Clinic";

export interface EndUser {
  id: string,
  count_messages_received: number,
  rolling_count_messages_received: number,
  count_api_requests: number,
  first_message_date: number,
  rolling_message_date: number,
  last_message_date: number,
  next_closest: Clinic|null,
}