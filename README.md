# Apollo Socket Network Interface (Server)

Apollo-GraphQL network interface for sockets. 

Enables high-performance communication without the overhead of HTTP.


## Example

```js
import createServer from 'apollo-socket-network-interface-server';
import { makeExecutableSchema } from 'graphql-tools';
import typeDefs from './typeDefs';
import resolvers from './resolvers';

// http://dev.apollodata.com/tools/graphql-tools/generate-schema.html#makeExecutableSchema
let schema = makeExecutableSchema({
    typeDefs: typeDefs,
    resolvers: resolvers,
});

let sockServer = createServer({
    path: '/tmp/redspider-graphql.sock',
    schema: schema,
});

['SIGTERM','SIGINT'].forEach(signal => process.on(signal, () => {
    // shut the server down cleanly
    sockServer.close();
    process.exit();
}));
```

## License

MIT.