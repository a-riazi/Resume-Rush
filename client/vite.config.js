import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    'import.meta.env.VITE_STRIPE_PUBLIC_KEY': JSON.stringify('pk_test_51Skz7gDrqLrRSKzcoFb6brsCNpKeRSEK1geJdXovQra6w5XzRmXF63zpmjk6seZO4eDxnxehEjw1e8N34CU2MgcF00w1xtoxjo'),
  }
})
