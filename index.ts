import Client, {
    CommitmentLevel,
    SubscribeRequestAccountsDataSlice,
    SubscribeRequestFilterAccounts,
    SubscribeRequestFilterBlocks,
    SubscribeRequestFilterBlocksMeta,
    SubscribeRequestFilterEntry,
    SubscribeRequestFilterSlots,
    SubscribeRequestFilterTransactions,
  } from "@triton-one/yellowstone-grpc";
  import { SubscribeRequestPing } from "@triton-one/yellowstone-grpc/dist/grpc/geyser";
  import { VersionedTransactionResponse } from "@solana/web3.js";
  import { TransactionFormatter } from "./utils/transaction-formatter";
  import { RaydiumAmmParser } from "./utils/raydium-amm-parser";
  import { createUmi } from '@metaplex-foundation/umi-bundle-defaults'
import { fetchDigitalAsset, mplTokenMetadata } from '@metaplex-foundation/mpl-token-metadata'
import { PublicKey } from "@solana/web3.js/lib";

// Use the RPC endpoint of your choice.
const umi = createUmi('https://rpc.shyft.to?api_key=YSvQCPP--81Ex_9W').use(mplTokenMetadata())

  
  interface SubscribeRequest {
    accounts: { [key: string]: SubscribeRequestFilterAccounts };
    slots: { [key: string]: SubscribeRequestFilterSlots };
    transactions: { [key: string]: SubscribeRequestFilterTransactions };
    transactionsStatus: { [key: string]: SubscribeRequestFilterTransactions };
    blocks: { [key: string]: SubscribeRequestFilterBlocks };
    blocksMeta: { [key: string]: SubscribeRequestFilterBlocksMeta };
    entry: { [key: string]: SubscribeRequestFilterEntry };
    commitment?: CommitmentLevel | undefined;
    accountsDataSlice: SubscribeRequestAccountsDataSlice[];
    ping?: SubscribeRequestPing | undefined;
  }
  const TXN_FORMATTER = new TransactionFormatter();
  const RAYDIUM_PARSER = new RaydiumAmmParser();
  const RAYDIUM_PUBLIC_KEY = RaydiumAmmParser.PROGRAM_ID;
  
  async function handleStream(client: Client, args: SubscribeRequest) {
    // Subscribe for events
    const stream = await client.subscribe();
  
    // Create `error` / `end` handler
    const streamClosed = new Promise<void>((resolve, reject) => {
      stream.on("error", (error) => {
        console.log("ERROR", error);
        reject(error);
        stream.end();
      });
      stream.on("end", () => {
        resolve();
      });
      stream.on("close", () => {
        resolve();
      });
    });
  
    // Handle updates
    stream.on("data", (data) => {
      try{
      if (data?.transaction) {
        const txn = TXN_FORMATTER.formTransactionFromJson(
          data.transaction,
          Date.now(),
        );
        //console.log(txn);
        const decodedRaydiumIxs = decodeRaydiumTxn(txn);
       
        if (!decodedRaydiumIxs?.length) return;
        const createPoolIx = decodedRaydiumIxs.find((decodedRaydiumIx) => {
          if (
            decodedRaydiumIx.name === "raydiumInitialize" ||
            decodedRaydiumIx.name === "raydiumInitialize2"
          ) {
            return decodedRaydiumIx;
          }
        });
        if (createPoolIx) {
          const info = JSON.stringify(createPoolIx.args);
          const parseInfo = JSON.parse(info);
          const solVault = parseInfo.pool_pc_token_account;
          const tokenVault = parseInfo.pool_coin_token_account;
          const solAddress = parseInfo.pc_mint_address;
          const tokenAddress = parseInfo.coin_mint_address;
          const lpMint = parseInfo.lp_mint_address;
          const pool = parseInfo.pool_withdraw_queue;
          const dev_wallet = parseInfo.user_wallet;
          const openTime = parseInfo.openTime
          const startTime = new Date(openTime * 1000); 
          const initialBalance = parseInfo.initPcAmount;
          console.log("found")
          //const asset = await fetchDigitalAsset(umi, tokenAddress);
          //console.log(asset);
          fetchDigitalAsset(umi,(tokenAddress == "So11111111111111111111111111111111111111112") ? solAddress : tokenAddress).then(async function (resp)  {
            if(resp.metadata.uri) {
              fetch(resp.metadata.uri).then((response) => response.json()).then((resp) => console.dir(resp)).catch((err) => console.log(err));

            }
            }).catch((err) => console.log(err));
            var dateObj = new Date(Date.now() - 17000);
            console.log(`parseDate: ${dateObj.toISOString()}`);
          console.log(`
          New LP Found https://translator.shyft.to/tx/${txn.transaction.signatures[0]} \n
          Token Address | ${tokenAddress}
          Sol Address | ${solAddress}
          Token Vault | ${tokenVault}
          Sol Vault | ${solVault}
          Lp mint | ${lpMint}
          Pool   | ${pool}
          Initial Balance | ${initialBalance/1000000000} sol
          Start Time | ${startTime}
          Owner/Dev | ${dev_wallet} 
          `
        );
        //   console.log(
        //     `New LP Found https://translator.shyft.to/tx/${txn.transaction.signatures[0]} \n`,
        //     JSON.stringify(createPoolIx.args, null, 2) + "\n",
        //   );
        }
      }
  }catch(error){
    if(error){
      console.log("Error")
    }
  }
});
  
    // Send subscribe request
    await new Promise<void>((resolve, reject) => {
      stream.write(args, (err: any) => {
        if (err === null || err === undefined) {
          resolve();
        } else {
          reject(err);
        }
      });
    }).catch((reason) => {
      console.error(reason);
      throw reason;
    });
  
    await streamClosed;
  }
  
  async function subscribeCommand(client: Client, args: SubscribeRequest) {
    while (true) {
      try {
        await handleStream(client, args);
      } catch (error) {
        console.error("Stream error, restarting in 1 second...", error);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    }
  }
  
  const client = new Client(
    'http://45.43.11.28:42069/',
    '',
    undefined,
  );
  
  const req: SubscribeRequest = {
    accounts: {},
    slots: {},
    transactions: {
      raydiumLiquidityPoolV4: {
        vote: false,
        failed: false,
        signature: undefined,
        accountInclude: [RAYDIUM_PUBLIC_KEY.toBase58()],
        accountExclude: [],
        accountRequired: [],
      },
    },
    transactionsStatus: {},
    entry: {},
    blocks: {},
    blocksMeta: {},
    accountsDataSlice: [],
    ping: undefined,
    commitment: CommitmentLevel.CONFIRMED,
  };
  
  subscribeCommand(client, req);
  
  function decodeRaydiumTxn(tx: VersionedTransactionResponse) {
    if (tx.meta?.err) return;
  
    const allIxs = TXN_FORMATTER.flattenTransactionResponse(tx);
  
    const raydiumIxs = allIxs.filter((ix) =>
      ix.programId.equals(RAYDIUM_PUBLIC_KEY),
    );
  
    const decodedIxs = raydiumIxs.map((ix) =>
      RAYDIUM_PARSER.parseInstruction(ix),
    );
  
    return decodedIxs;
  }
  