import Router from '@koa/router'
import * as ctrl from '../controllers/mobile'

export const mobileRoutes = new Router()

mobileRoutes.get('/api/mobile/manifest', ctrl.manifest)
mobileRoutes.get('/api/mobile/content', ctrl.content)
mobileRoutes.get('/api/mobile/files/:name', ctrl.file)
