import axios from "axios"

export async function requestFaucet(address, endpoint = "https://testnet.archethic.net") {
    const faucetLink = `${endpoint}/faucet`

    let response = await axios.get(faucetLink, {
        headers: {
            Origin: endpoint,
            Referer: faucetLink,
            Cookie: "_archethic_key=SFMyNTY.g3QAAAABbQAAAAtfY3NyZl90b2tlbm0AAAAYbUdHbWRVQWVvV1ZIcGtMazhxX0VmdG56.1_OFPYLSwLdkA7SnZNa7A5buhBL08fh6PaZRqu7SGh0"
        }
    })

    const matches = response.data.match(/(?<=name="_csrf_token" value=").*?(?=">)/)
    const csrf_token = matches[0]

    const params = new URLSearchParams()
    params.append('_csrf_token', csrf_token)
    params.append('address', address)

    response = await axios.post(`${endpoint}/faucet`, params, {
        headers: {
            Origin: endpoint,
            Referer: faucetLink,
            Cookie: "_archethic_key=SFMyNTY.g3QAAAABbQAAAAtfY3NyZl90b2tlbm0AAAAYbUdHbWRVQWVvV1ZIcGtMazhxX0VmdG56.1_OFPYLSwLdkA7SnZNa7A5buhBL08fh6PaZRqu7SGh0",
            "Content-Type": "application/x-www-form-urlencoded"
        }
    })

    if(!response.data.match(/Transaction submitted/)) {
        process.exit(1)
    }
}

export async function findTokenBalance(archethic, address, tokenAddress) {
    const balance = await archethic.network.getBalance(address)
    const tokenBalance = balance.token.find(x => {
        return x.address == tokenAddress
    }) 
    return tokenBalance
}