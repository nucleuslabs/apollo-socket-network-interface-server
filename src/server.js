import Net from 'net';
import makeDebug from 'debug';
import Chalk from 'chalk';
const debug = makeDebug('asnis');
import {runQuery} from 'graphql-server-core';
import Msgpack from 'msgpack-lite';
import queryLogger from './query-logger';
import FileSystem from 'fs';
import {readUInt64BE, writeUInt64BE} from './buffer';

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


        let buffer, queryId, length, offset;

        c.on('data', packet => {
            // log("Start",queryId,packet.length);
            if(!queryId) {  // new message
                // log("Part 1",queryId,offset);
                if(packet.length < 16) {
                    throw new Error(`Packet is too small; missing header?`);
                }

                queryId = packet::readUInt64BE(0);
                length = packet::readUInt64BE(8);
                // log("Packed Length",length);
                offset = 0;
                buffer = Buffer.allocUnsafe(length);
                packet.copy(buffer, offset, 16);
                offset += packet.length - 16;
            } else {
                // log("Part X",queryId,offset,length,buffer.length,packet.length,packet.slice(0,16));
                packet.copy(buffer, offset);
                offset += packet.length;
            }
            if(offset >= length) {
                // log("Packet Length",queryId,packet.length);
                // log("Buffer Length",queryId,buffer.length);
                let req;
                try {
                    req = Msgpack.decode(buffer);
                } catch(err) {
                    console.error(`${Chalk.red('msgpack decode error:')} ${err.message}`);
                    // TODO: send error response -- we have the queryId
                    return;
                }
                // log("req",req, buffer);
                // log('Received',data);
                let ql = queryLogger();

                // log('RUNNING QUERY',queryId);

                runQuery({...req, schema: SCHEMA}).then((queryId => result => {
                    ql(Chalk.magenta('socket'), req.query);
                    // log("Result",result);
                    let resMsg = Msgpack.encode(result);
                    let resData = Buffer.allocUnsafe(resMsg.length + 16);
                    resData::writeUInt64BE(queryId, 0);
                    resData::writeUInt64BE(resMsg.length, 8);
                    resMsg.copy(resData, 16);
                    // log("almost write",resData.length);
                    // log('FIN QUERY',queryId);
                    let flushed = c.write(resData);
                    // log("flushed",flushed);
                })(queryId));

                queryId = null;
                length = null;
                offset = null;
                buffer = null; // TODO: fill with remainder of packet
            }
        })
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