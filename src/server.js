import Net from 'net';
import makeDebug from 'debug';
import Chalk from 'chalk';
const debug = makeDebug('asnis');
import {runQuery} from 'graphql-server-core';
import Msgpack from 'msgpack-lite';
import queryLogger from './query-logger';
import FileSystem from 'fs';
import processData from './processData';

export default function createServer(options) {
    const SOCK_FILE = options.path || '/tmp/apollo.sock';
    const SCHEMA = options.schema;
    const BACKLOG = options.backlog || undefined;
    
    if(!SCHEMA) {
        throw new Error(`Apollo socket server requires a options.schema. See http://dev.apollodata.com/tools/graphql-tools/generate-schema.html#makeExecutableSchema`)
    }

    const sockServer = Net.createServer(c => {
        debug(`Client ${Chalk.green('connected')} to socket server`);
        // c.on('end', hadError => {
        //     log('Client ended session');
        // });
        c.on('close', () => {
            debug(`Client ${Chalk.red('disconnected')}`);
        });


        c.on('data', processData((queryId,msgBuf) => {
            // console.log(msgBuf,msgBuf.length);
            
            let req = Msgpack.decode(msgBuf);
            let ql = queryLogger();

            // log('RUNNING QUERY',queryId);

            runQuery({...req, schema: SCHEMA}).then(result => {
                ql(Chalk.magenta('socket'), req.query);
                // log("Result",result);
                let resMsg = Msgpack.encode(result);
                let resData = Buffer.allocUnsafe(resMsg.length + 12);

                resData.writeUIntBE(queryId, 0, 6);
                resData.writeUIntBE(resMsg.length, 6, 6);
                
                resMsg.copy(resData, 12);
                // log("almost write",resData.length);
                // log('FIN QUERY',queryId);
                let flushed = c.write(resData);
                // log("flushed",flushed);
            });
        }));
    });

    sockServer.on('error', serverError => {
        if(serverError.code === 'EADDRINUSE') {
            let clientSocket = new Net.Socket();
            clientSocket.on('error', clientError => {
                if(clientError.code === 'ECONNREFUSED') {
                    FileSystem.unlink(SOCK_FILE, unlinkErr => {
                        if(unlinkErr) throw unlinkErr;
                        sockServer.listen(SOCK_FILE, () => {
                            debug(`Sock server improperly shut down. Listening on '${sockServer.address()}'`)
                        });
                    });
                }
            });
            clientSocket.connect({path: SOCK_FILE}, () => {
                throw new Error(`Server already running`);
            });
        }
    });

    sockServer.listen(SOCK_FILE, BACKLOG, () => {
        debug(`Listening on ${Chalk.underline(sockServer.address())}`)
    });
    
    return sockServer;
}