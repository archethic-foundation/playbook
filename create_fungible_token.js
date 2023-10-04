import Archethic, { Crypto, Utils } from "archethic"
import { randomBytes } from "crypto"

const originPrivateKey = Utils.originPrivateKey;

import {requestFaucet } from "./utils.js"

async function run() {
    const endpoint = process.env["ENDPOINT"] || "https://testnet.archethic.net"
    const archethic = new Archethic(endpoint)
    await archethic.connect()
    
    const seed = randomBytes(32)
    const address = Crypto.deriveAddress(seed)

    console.log("Request funds from faucet...")
    await requestFaucet(Utils.uint8ArrayToHex(address), endpoint)

    const senderBalance = await archethic.network.getBalance(address)
    if (Utils.fromBigInt(senderBalance.uco) != 100) {
        console.log(`Invalid balance for the sender's address`)
        process.exit(1)
    }

    console.log("Funds received from faucet")

    const tx = archethic.transaction.new()
        .setType("token")
        .setContent(JSON.stringify({
            supply: Utils.toBigInt(100),
            name: "MyToken",
            type: "fungible",
            symbol: "MTK",
            properties: {
                description: "This is token used to test token creation"
            }
        }))
        .build(seed)
        .originSign(originPrivateKey)


    tx
        .on("sent", () => {
            console.log("Token transaction sent")
            console.log("Await validation ...")
        })
        .on("requiredConfirmation", async (_confirmations, sender) => {
            sender.unsubscribe()

            console.log(`Token transaction created - ${Utils.uint8ArrayToHex(tx.address)}`)

            const senderBalance = await archethic.network.getBalance(address)
            
            const { amount: tokenAmount } = senderBalance.token.find(x => {
                return x.address.toLowerCase() == Utils.uint8ArrayToHex(tx.address)
            })

            if (Utils.fromBigInt(tokenAmount) != 100) {
                console.log(`Invalid balance for the sender's address (${Utils.uint8ArrayToHex(address)}) after send and should be 100 token`)
                process.exit(1)
            }

            console.log("100 MKT tokens have been minted")

            process.exit(0)
            
        })
        .on("error", (context, reason) => {
            console.log(`Token transaction failed - ${reason}`)
            process.exit(1)
        })
        .send()
}

run()