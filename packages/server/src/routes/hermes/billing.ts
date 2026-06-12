import Router from '@koa/router'
import * as ctrl from '../../controllers/hermes/billing'
import { requireSuperAdmin } from '../../middleware/user-auth'

export const billingRoutes = new Router()

billingRoutes.get('/api/hermes/billing/me', ctrl.me)

billingRoutes.use(requireSuperAdmin)
billingRoutes.get('/api/hermes/billing/summary', ctrl.summary)
billingRoutes.get('/api/hermes/billing/model-prices', ctrl.prices)
billingRoutes.put('/api/hermes/billing/model-prices', ctrl.savePrice)
billingRoutes.post('/api/hermes/billing/users/:id/credits', ctrl.adjustCredits)
billingRoutes.get('/api/hermes/billing/transactions', ctrl.transactions)
