'use strict'

const OFFLINE_URL = '/offline/index.html'

const version = '20210325'
const cacheName = version + '/static'
const pagesCacheName = 'pages'
const imagesCacheName = 'medias'
const filetypesRegex = /\.(webp|jpe?g|png|gif|svg|mapbox)/
const maxPages = 10 // Maximum number of pages to cache
const maxImages = 25 // Maximum number of images to cache
const timeout = 5000

const cacheList = [cacheName, pagesCacheName, imagesCacheName]

const updateCache = () =>
  caches
    .open(cacheName)
    .then((cache) => {
      // Non blocking items
      cache.addAll([
        '/medias/archibat1.gif',
        '/medias/bllank2011.jpg',
        '/medias/cata1.jpg',
        '/medias/chloetallot2013.jpg',
        '/medias/chloetallot2.jpg',
        '/medias/jcdecaux.jpg',
        '/medias/crown.jpg',
        '/medias/sporta.jpg',
        '/medias/sporta1.jpg',
        '/medias/sporta2.jpg',
        '/medias/love-books.jpg',
        '/medias/plan1.jpg',
        '/medias/plan2.jpg',
        '/medias/plan3.jpg',
        '/medias/qapa.jpg',
        '/medias/qapa2.jpg',
        '/medias/rightpeople2.jpg',
        '/medias/simply.jpg',
        '/medias/zidane.jpg',
        '/medias/tbwa-france.jpg',
        '/medias/voulzy.jpg',
      ])
      // blocking elements
      return cache.addAll(['/anime.min.js', OFFLINE_URL])
    })
    .catch(console.error)

const doCacheThings = () => {
  const pages = []
  return clients
    .matchAll({
      includeUncontrolled: true,
    })
    .then((allClients) => {
      for (const client of allClients) {
        pages.push(client.url)
      }
    })
    .then(() => {
      caches.open(pagesCacheName).then((pagesCache) => {
        return pagesCache.addAll(pages)
      })
    })
}

const trimCache = (cacheName, maxItems) => {
  caches.open(cacheName).then((cache) => {
    cache.keys().then((keys) => {
      if (keys.length > maxItems) {
        cache.delete(keys[0]).then(() => {
          trimCache(cacheName, maxItems)
        })
      }
    })
  })
}

const clearOldCaches = () =>
  caches
    .keys()
    .then((keys) => Promise.all(keys.filter((key) => !cacheList.includes(key)).map((key) => caches.delete(key))))

// life cycle sw
// 1. download
// 2. install
// 3. wait
// 4. activate

addEventListener('install', (installEvent) => {
  installEvent.waitUntil(
    (async () => {
      const cache = await caches.open(cacheName)
      // Setting {cache: 'reload'} in the new request will ensure that the
      // response isn't fulfilled from the HTTP cache; i.e., it will be from
      // the network.
      await cache.add(new Request(OFFLINE_URL, { cache: 'reload' }))
      updateCache()
        .then(() => doCacheThings())
        .then(() => skipWaiting())
    })()
  )
})

addEventListener('activate', (event) => {
  event.waitUntil(
    clearOldCaches().then(() => {
      return clients.claim()
    })
  )
})

if (registration.navigationPreload) {
  addEventListener('activate', (event) => {
    event.waitUntil(registration.navigationPreload.enable())
  })
}

addEventListener('fetch', (event) => {
  const request = event.request

  // Ignore non-GET requests
  if (request.method !== 'GET') {
    return
  }

  const retrieveFromCache = caches.match(request)

  // For HTML requests, try the network first, fall back to the cache, finally the offline page
  if (request.mode === 'navigate' || request.headers.get('Accept').includes('text/html')) {
    event.respondWith(
      new Promise((resolveWithResponse) => {
        const timer = setTimeout(() => {
          // Time out: CACHE
          retrieveFromCache.then((responseFromCache) => {
            if (responseFromCache) {
              resolveWithResponse(responseFromCache)
            }
          })
        }, timeout)

        Promise.resolve(event.preloadResponse)
          .then((preloadResponse) => preloadResponse || fetch(request))
          .then((responseFromFetch) => {
            // NETWORK
            clearTimeout(timer)
            const copy = responseFromFetch.clone()
            // Stash a copy of this page in the pages cache
            try {
              event.waitUntil(
                caches.open(pagesCacheName).then((pagesCache) => {
                  return pagesCache.put(request, copy)
                })
              )
            } catch (error) {
              console.error(error)
            }
            resolveWithResponse(responseFromFetch)
          })
          .catch((fetchError) => {
            clearTimeout(timer)
            console.error(fetchError, request)
            // CACHE or FALLBACK
            retrieveFromCache.then((responseFromCache) => {
              resolveWithResponse(responseFromCache || caches.match('/offline'))
            })
          })
      })
    )
    return
  }

  // For non-HTML requests, look in the cache first, fall back to the network
  event.respondWith(
    retrieveFromCache.then((responseFromCache) => {
      // CACHE
      return (
        responseFromCache ||
        fetch(request)
          .then((responseFromFetch) => {
            // NETWORK
            // If the request is for an image, stash a copy of this image in the images cache
            if (request.url.match(filetypesRegex)) {
              const copy = responseFromFetch.clone()
              try {
                event.waitUntil(
                  caches.open(imagesCacheName).then((imagesCache) => {
                    return imagesCache.put(request, copy)
                  })
                )
              } catch (error) {
                console.error(error)
              }
            }
            return responseFromFetch
          })
          .catch((fetchError) => {
            console.error(fetchError)
            // FALLBACK
            // show an offline placeholder
            if (request.url.match(filetypesRegex)) {
              return new Response(
                '<svg role="img" aria-labelledby="offline-title" viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg"><title id="offline-title">Offline</title><g fill="none" fill-rule="evenodd"><path fill="#D8D8D8" d="M0 0h400v300H0z"/><text fill="#595959" font-family="Helvetica Neue,sans-serif" font-size="72" font-weight="bold"><tspan x="93" y="172">offline</tspan></text></g></svg>',
                { headers: { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' } }
              )
            }
          })
      )
    })
  )
})

addEventListener('message', (event) => {
  if (event.data.command == 'trimCaches') {
    trimCache(pagesCacheName, maxPages)
    trimCache(imagesCacheName, maxImages)
  }
})
