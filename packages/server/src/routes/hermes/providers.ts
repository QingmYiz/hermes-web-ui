import Router from '@koa/router'
import * as ctrl from '../../controllers/hermes/providers'
import { requireSuperAdmin } from '../../middleware/user-auth'

export const providerRoutes = new Router()

providerRoutes.post('/api/hermes/config/providers', ctrl.create)
providerRoutes.put('/api/hermes/config/providers/:poolKey', ctrl.update)
providerRoutes.delete('/api/hermes/config/providers/:poolKey', ctrl.remove)
providerRoutes.post('/api/hermes/config/profile-models', requireSuperAdmin, ctrl.configureProfileModels)
