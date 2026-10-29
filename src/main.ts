import '@vex/ui/fonts.css'
import '@vex/ui/style.css'
import './styles.css'

import { VxBuild } from '@vex/ui'
import { syncDocumentTitle } from '@vex/ui/utils'
import { createAccount } from '@vex/ui/account'
import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'

import App from './App.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', meta: { title: 'All services' }, component: () => import('./pages/OverviewPage.vue') },
    // Gatus's own page for one endpoint lives at /endpoints/<key>; the same path here keeps its links working.
    { path: '/endpoints/:key', meta: { title: 'Service' }, component: () => import('./pages/EndpointPage.vue'), props: (r) => ({ endpointKey: String(r.params.key) }) },
    { path: '/:pathMatch(.*)*', meta: { title: 'Not found' }, component: () => import('./pages/NotFoundPage.vue') },
  ],
  scrollBehavior: (to, from, saved) => saved ?? (to.path !== from.path ? { top: 0 } : undefined),
})

syncDocumentTitle(router, __TITLE__)

createApp(App).use(router).use(VxBuild, { commit: __COMMIT__ }).use(createAccount()).mount('#app')
