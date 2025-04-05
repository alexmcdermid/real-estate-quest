import { createApp } from 'vue'
import App from './App.vue'
import vuetify from './plugins/vuetify'
import router from './router';
import { loadFonts } from './plugins/webfontloader'
import { firebaseApp } from '../src/config/firebaseConfig'
import { VueFire, VueFireFirestoreOptionsAPI  } from 'vuefire'

loadFonts()

const app = createApp(App)

app.use(vuetify)
app.use(router);
app.use(VueFire, {
  firebaseApp,
  modules: [VueFireFirestoreOptionsAPI()],
})
app.mount('#app')