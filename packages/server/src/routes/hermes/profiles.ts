import Router from '@koa/router'
import * as ctrl from '../../controllers/hermes/profiles'
import { requireSuperAdmin } from '../../middleware/user-auth'

export const profileRoutes = new Router()

profileRoutes.get('/api/hermes/profiles', ctrl.list)
profileRoutes.post('/api/hermes/profiles', requireSuperAdmin, ctrl.create)
profileRoutes.get('/api/hermes/profiles/runtime-statuses', ctrl.runtimeStatuses)
profileRoutes.get('/api/hermes/profiles/:name/runtime-status', ctrl.runtimeStatus)
profileRoutes.post('/api/hermes/profiles/:name/restart', ctrl.restartProfileRuntime)
profileRoutes.post('/api/hermes/profiles/:name/gateway/restart', ctrl.restartGatewayForProfile)
profileRoutes.put('/api/hermes/profiles/:name/avatar', ctrl.updateAvatar)
profileRoutes.delete('/api/hermes/profiles/:name/avatar', ctrl.deleteAvatar)
profileRoutes.get('/api/hermes/profiles/:name', ctrl.get)
profileRoutes.delete('/api/hermes/profiles/:name', requireSuperAdmin, ctrl.remove)
profileRoutes.post('/api/hermes/profiles/:name/rename', requireSuperAdmin, ctrl.rename)
profileRoutes.put('/api/hermes/profiles/active', requireSuperAdmin, ctrl.switchProfile)
profileRoutes.post('/api/hermes/profiles/:name/export', ctrl.exportProfile)
profileRoutes.post('/api/hermes/profiles/import', requireSuperAdmin, ctrl.importProfile)
