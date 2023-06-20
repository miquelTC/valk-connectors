import React, { useEffect, useState } from 'react'
import { ethers } from 'ethers'

const App = () => {
  const [account, setAccount] = useState(null)
  const [signer, setSigner] = useState(null)

  useEffect(() => {
    // Function to fetch all the blockchain data
    const loadBlockchainData = async () => {
      // Request accounts acccess if needed
      try {
        await window.ethereum.request({ method: 'eth_requestAccounts' })
      } catch (error) {
        console.error(error)
      }

      const provider = new ethers.providers.Web3Provider(window.ethereum)
      await provider.send('eth_requestAccounts', [])
      const signer = provider.getSigner()
      setSigner(signer)

      // Load Account
      const accounts = await provider.listAccounts()
      setAccount(accounts[0])
    }

    loadBlockchainData()
  }, [])

  const graphUrl =
    'https://server4.merlin-api-v1.cf/mainnet/subgraphs/name/prd-convex-farm2'

  const graphQuery = (user) => {
    return `
      {
        deFiPositionsChains(where: {user: "${user}", activePositions_not: []}) {
          id
          activePositions {
            position {
              tokenSymbol
              balance
            }
          }
        }
        userTokenOverviews(where: {user: "${user}"}) {
          tokenAddress
          underlyingTokens
        }
      }
    `
  }

  /*******************************************************
   *                                                     *
   *                    READ VALUES                      *
   *                                                     *
   * *****************************************************/

  async function getActivePositions() {
    // hardcode user to test
    const user = '0x06b1bf28c962363f212878bdf87417ebd0316220'
    const response = await fetch(graphUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: graphQuery(user),
      }),
    })

    const data = await response.json()
    const activePositions = []
    for (let i = 0; i < data.data.deFiPositionsChains.length; i++) {
      // Get tokenId
      const id = data.data.deFiPositionsChains[i].id
      const dashIndex = id.indexOf('-')
      const colonIndex = id.indexOf(':')
      const tokenId = id.substring(dashIndex + 1, colonIndex)
      // Get underlyings
      const underlyings = data.data.userTokenOverviews.find(
        (item) => item.tokenAddress === tokenId
      ).underlyingTokens

      const balance = data.data.deFiPositionsChains[i].activePositions.reduce(
        (acc, item) => {
          return acc.add(ethers.BigNumber.from(item.position.balance))
        },
        ethers.BigNumber.from(0)
      )
      activePositions.push({
        tokenAddress: tokenId,
        tokenSymbol:
          data.data.deFiPositionsChains[i].activePositions[0].position
            .tokenSymbol,
        balance: balance.toString(),
        underlyings,
      })
    }
    console.log(activePositions)
    return activePositions
  }

  return (
    <React.Fragment>
      <h1>Compound</h1>
      <button className="btn btn-primary m-3" onClick={getActivePositions}>
        Get Active Positions
      </button>
    </React.Fragment>
  )
}

export default App
