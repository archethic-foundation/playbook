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

    const recipient_address = Crypto.deriveAddress(randomBytes(32))

    const tx = archethic.transaction.new()
        .setType("transfer")
        .addUCOTransfer(recipient_address, Utils.toBigInt(10))
        .build(seed)
        .originSign(originPrivateKey)

    tx
        .on("sent", () => {
            console.log("UCO transaction sent")
            console.log("Await validation ...")
        })
        .on("requiredConfirmation", async (_confirmations, sender) => {
            sender.unsubscribe()

            console.log(`UCO transaction created - ${Utils.uint8ArrayToHex(tx.address)}`)

            const recipientBalance = await archethic.network.getBalance(recipient_address)
            if (Utils.fromBigInt(recipientBalance.uco) != 10) {
                console.log(`Invalid balance for the recipient's address (${Utils.uint8ArrayToHex(recipient_address)}) after send and should be 10 UCO`)
                process.exit(1)
            }

            const senderBalance = await archethic.network.getBalance(address)
            if (Math.ceil(Utils.fromBigInt(senderBalance.uco)) != 90) {
                console.log(`Invalid balance for the sender's address (${Utils.uint8ArrayToHex(address)}) after send and should be ~90 UCO`)
                process.exit(1)
            }

            console.log(`${Utils.uint8ArrayToHex(recipient_address)} received 10 UCO`)

            process.exit(0)
            
        })
        .on("error", (context, reason) => {
            console.log(`UCO transaction failed - ${reason}`)
            process.exit(1)
        })
        .send()
    
}

run()
