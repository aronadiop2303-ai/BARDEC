// Redirects to the most recent successful EAS Android APK build.
// Avoids hardcoding a per-build expo.dev artifact URL on the landing page
// (those URLs change on every build and are easy to mis-copy/truncate).
//
// Requires EXPO_TOKEN in Vercel project env vars — an Expo access token
// (expo.dev -> account settings -> Access Tokens), same kind of token
// already used as the EXPO_TOKEN GitHub Actions secret.

const APP_ID = 'add24569-1fb2-44fa-b98b-2f1dbbb3e400'; // aronadiop/bardec

module.exports = async (req, res) => {
  const token = process.env.EXPO_TOKEN;
  if (!token) {
    res.status(500).send('EXPO_TOKEN manquant côté serveur.');
    return;
  }

  const query = `
    query LatestAndroidBuild($appId: String!, $filter: BuildFilter) {
      app {
        byId(appId: $appId) {
          builds(offset: 0, limit: 5, filter: $filter) {
            id
            status
            buildProfile
            createdAt
            artifacts { applicationArchiveUrl }
          }
        }
      }
    }
  `;
  const variables = {
    appId: APP_ID,
    filter: { platform: 'ANDROID', status: 'FINISHED', distribution: 'INTERNAL' },
  };

  try {
    const r = await fetch('https://api.expo.dev/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ query, variables }),
    });
    const json = await r.json();
    const builds = json?.data?.app?.byId?.builds ?? [];
    const build = builds.find(
      (b) => b.buildProfile === 'preview' && b.artifacts?.applicationArchiveUrl
    );

    if (!build) {
      res.status(404).send('Aucun build APK disponible pour le moment.');
      return;
    }

    res.setHeader('Cache-Control', 'no-store');
    res.writeHead(302, { Location: build.artifacts.applicationArchiveUrl });
    res.end();
  } catch (e) {
    res.status(502).send('Erreur lors de la récupération du dernier build.');
  }
};
