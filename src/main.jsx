import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import App from './App.jsx'
import './firebase'
import './index.css'

function preloadVideo(src) {
  const link = document.createElement('link')
  link.rel = 'preload'
  link.as = 'video'
  link.href = src
  document.head.appendChild(link)
}

function preloadStartupVideo() {
  preloadVideo('/videos/Startup.mp4')
}

function preloadLoadingVideo() {
  const link = document.createElement('link')
  link.rel = 'preload'
  link.as = 'image'
  link.href = '/videos/Loading.gif'
  document.head.appendChild(link)
}

// Register service worker for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

// Preload startup video immediately (needed right after splash)
preloadStartupVideo()

// Preload loading video after a short delay (not needed on startup)
window.addEventListener('load', () => {
  setTimeout(preloadLoadingVideo, 3000)
})

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)