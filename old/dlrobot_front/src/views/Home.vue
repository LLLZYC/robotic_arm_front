<template>
  <div class="home">
    <App />
  </div>
</template>

<script>
import App from '../App.vue'

export default {
  name: 'Home',
  components: {
    App
  }
}
</script>

<style scoped>
.home {
  height: 100vh;
  width: 100vw;
}
</style>