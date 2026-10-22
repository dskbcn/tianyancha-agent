import { eveChannel } from 'eve/channels/eve'
import { routePolicy } from '#lib/auth.ts'

export default eveChannel({
  auth: routePolicy('tianyancha-agent'),
})
