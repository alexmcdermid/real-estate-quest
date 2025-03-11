import { createApp } from 'vue'
import App from './App.vue'
import vuetify from './plugins/vuetify'
import { loadFonts } from './plugins/webfontloader'
import { firebaseApp } from '../src/config/firebaseConfig'
import { VueFire, VueFireAuth } from 'vuefire'

loadFonts()

const app = createApp(app)

app.use(VueFire, {
  firebaseApp,
  modules: [
    VueFireAuth()
  ]
})

app.use(vuetify)
app.mount('#app')