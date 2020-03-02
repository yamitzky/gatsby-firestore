exports.sourceNodes = async (
  { actions, boundActionCreators, reporter, createContentDigest },
  { types, credential, appConfig }
) => {
  // configure firebase-admin
  const firebase = initFirebase();
  const db = firebase.firestore();

  // gatsby v1 fallback
  const { createNode } = actions || boundActionCreators;

  // creates node for provided type
  async function createDocumentNode({ type, parent = null }) {
    // contruct firestore collectionName for current type
    const collectionName =
      parent && parent.id
        ? `${parent.id}/${type.collection}`
        : type.collection;

    // get records for current type from firestore
    const snapshot = await db.collection(collectionName).get();
    const promises = [];
    snapshot.forEach(doc => {
      promises.push(
        new Promise(async resolve => {
          const id = `${collectionName}/${doc.id}`
          let children = [];
          if (type.subCollections) {
            // if any subCollections exists, recursively create new nodes
            const subCollectionIds = await Promise.all(
              type.subCollections.map(subCollection =>
                createDocumentNode({
                  type: subCollection,
                  parent: { id, ...type, collectionName },
                })
              )
            );
            // add IDs of all subCollection nodes to children
            type.subCollections.map((subCollection, i) => {
              children = [...children, ...subCollectionIds[i]];
            });
          }
          // create node for current type
          createNode({
            id,
            docId: doc.id,
            parent: parent ? parent.id : null,
            children,
            internal: {
              type: type.type,
              contentDigest: createContentDigest(id),
            },
            ...type.map(doc.data()),
          });
          // resolve with current document ID
          resolve(id);
        })
      );
    });
    return Promise.all(promises);
  }

  function initFirebase() {
    const firebase = require('firebase-admin');
    try {
      if (firebase.apps || !firebase.apps.length) {
        const cfg = appConfig
          ? appConfig
          : { credential: firebase.credential.cert(credential) };
        firebase.initializeApp(cfg);
        return firebase;
      }
      return firebase;
    } catch (e) {
      reporter.error(
        'Could not initialize Firebase. Please check `credential` property in gatsby-config.js'
      );
      return;
    }
  }

  // main call to create nodes for all provided types
  await Promise.all(types.map(type => createDocumentNode({ type })));
  return;
};
