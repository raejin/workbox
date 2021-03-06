const expect = require('chai').expect;

const activateAndControlSW = require('../../../infra/testing/activate-and-control');
const cleanSWEnv = require('../../../infra/testing/clean-sw');

describe(`[workbox-precaching] Precache and Update`, function() {
  const DB_NAME = 'workbox-precache-http___localhost_3004_test_workbox-precaching_static_precache-and-update_';

  let testServerAddress = global.__workbox.server.getAddress();
  const testingUrl = `${testServerAddress}/test/workbox-precaching/static/precache-and-update/`;

  beforeEach(async function() {
    // Navigate to our test page and clear all caches before this test runs.
    await cleanSWEnv(global.__workbox.webdriver, testingUrl);
  });

  const getCachedRequests = (cacheName) => {
    return global.__workbox.webdriver.executeAsyncScript((cacheName, cb) => {
      caches.open(cacheName)
      .then((cache) => {
        return cache.keys();
      })
      .then((keys) => {
        cb(
          keys.map((request) => request.url).sort()
        );
      });
    }, cacheName);
  };

  it(`should load a page with service worker `, async function() {
    const SW_1_URL = `${testingUrl}sw-1.js`;
    const SW_2_URL = `${testingUrl}sw-2.js`;

    await global.__workbox.webdriver.get(testingUrl);

    const getIdbData = global.__workbox.seleniumBrowser.getId() === 'safari' ?
      require('../utils/getPrecachedIDBData-safari') :
      require('../utils/getPrecachedIDBData');

    // Precaching will cache bust with a search param in some situations.
    const needsCacheBustSearchParam = await global.__workbox.webdriver.executeScript(() => {
      return !('cache' in Request.prototype);
    });

    // Clear out the counters so that we start fresh.
    global.__workbox.server.reset();

    // Register the first service worker.
    await activateAndControlSW(SW_1_URL);

    // Check that only the precache cache was created.
    const keys = await global.__workbox.webdriver.executeAsyncScript((cb) => {
      caches.keys().then((keys) => cb(keys));
    });
    expect(keys).to.deep.equal([
      'workbox-precache-http://localhost:3004/test/workbox-precaching/static/precache-and-update/',
    ]);

    // Check that the cached requests are what we expect for sw-1.js
    let cachedRequests = await getCachedRequests(keys[0]);
    expect(cachedRequests).to.deep.equal([
      'http://localhost:3004/test/workbox-precaching/static/precache-and-update/index.html',
      'http://localhost:3004/test/workbox-precaching/static/precache-and-update/styles/index.css',
    ]);

    let savedIDBData = await getIdbData(DB_NAME);
    expect(savedIDBData).to.deep.equal([
      {
        revision: '1',
        url: 'http://localhost:3004/test/workbox-precaching/static/precache-and-update/index.html',
      },
      {
        revision: '1',
        url: 'http://localhost:3004/test/workbox-precaching/static/precache-and-update/styles/index.css',
      },
    ]);

    // Make sure the requested URL's include cache busting search param if needed.
    let requestsMade = global.__workbox.server.getRequests();
    if (needsCacheBustSearchParam) {
      expect(requestsMade['/test/workbox-precaching/static/precache-and-update/styles/index.css']).to.equal(1);
      expect(requestsMade['/test/workbox-precaching/static/precache-and-update/index.html?_workbox-cache-bust=1']).to.equal(1);
      expect(requestsMade['/test/workbox-precaching/static/precache-and-update/styles/index.css?_workbox-cache-bust=1']).to.equal(1);
    } else {
      expect(requestsMade['/test/workbox-precaching/static/precache-and-update/styles/index.css']).to.equal(1);
      expect(requestsMade['/test/workbox-precaching/static/precache-and-update/index.html']).to.equal(1);
    }

    // Request the page and check that the precached assets weren't requested from the network
    global.__workbox.server.reset();
    await global.__workbox.webdriver.get(testingUrl);

    requestsMade = global.__workbox.server.getRequests();
    expect(requestsMade['/test/workbox-precaching/static/precache-and-update/']).to.equal(undefined);
    expect(requestsMade['/test/workbox-precaching/static/precache-and-update/index.html']).to.equal(undefined);
    expect(requestsMade['/test/workbox-precaching/static/precache-and-update/styles/index.css']).to.equal(undefined);

    // This is a crude way to fake an updated service worker.
    const error = await global.__workbox.webdriver.executeAsyncScript((SW_1_URL, cb) => {
      navigator.serviceWorker.getRegistration()
      .then((reg) => reg.unregister(SW_1_URL))
      .then(() => cb())
      .catch((err) => cb(err.message));
    }, SW_1_URL);
    if (error) {
      throw error;
    }

    // Activate the second service worker
    await activateAndControlSW(SW_2_URL);

    // Ensure that the new assets were requested and cache busted.
    requestsMade = global.__workbox.server.getRequests();
    if (needsCacheBustSearchParam) {
      expect(requestsMade['/test/workbox-precaching/static/precache-and-update/index.html?_workbox-cache-bust=2']).to.equal(1);
      expect(requestsMade['/test/workbox-precaching/static/precache-and-update/new-request.txt?_workbox-cache-bust=2']).to.equal(1);
    } else {
      expect(requestsMade['/test/workbox-precaching/static/precache-and-update/index.html']).to.equal(1);
      expect(requestsMade['/test/workbox-precaching/static/precache-and-update/new-request.txt']).to.equal(1);
    }

    // Check that the cached entries were deleted / added as expected when
    // updating from sw-1.js to sw-2.js
    cachedRequests = await getCachedRequests(keys[0]);
    expect(cachedRequests).to.deep.equal([
      'http://localhost:3004/test/workbox-precaching/static/precache-and-update/index.html',
      'http://localhost:3004/test/workbox-precaching/static/precache-and-update/new-request.txt',
    ]);

    savedIDBData = await getIdbData(DB_NAME);
    expect(savedIDBData).to.deep.equal([
      {
        revision: '2',
        url: 'http://localhost:3004/test/workbox-precaching/static/precache-and-update/index.html',
      },
      {
        revision: '2',
        url: 'http://localhost:3004/test/workbox-precaching/static/precache-and-update/new-request.txt',
      },
    ]);

    // Refresh the page and test that the requests are as expected
    global.__workbox.server.reset();
    await global.__workbox.webdriver.get(testingUrl);

    requestsMade = global.__workbox.server.getRequests();
    // Ensure the HTML page is returned from cache and not network
    expect(requestsMade['/test/workbox-precaching/static/precache-and-update/']).to.equal(undefined);
    // Ensure the now deleted index.css file is returned from network and not cache.
    expect(requestsMade['/test/workbox-precaching/static/precache-and-update/styles/index.css']).to.equal(1);
  });
});
