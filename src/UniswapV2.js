import React, { useEffect, useState } from 'react'
import { ethers } from 'ethers'
import Router from './abi/uniswapV2/router02.json'
import Factory from './abi/uniswapV2/Factory.json'
import Pair from './abi/uniswapV2/Pair.json'
import tokenABI from './abi/IERC20.json'

const App = () => {
  const [account, setAccount] = useState(null)
  const [router, setRouter] = useState(null)
  const [factory, setFactory] = useState(null)
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

      // Load Contracts
      const router = new ethers.Contract(
        '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D',
        Router,
        signer
      )
      setRouter(router)

      const factory = new ethers.Contract(
        '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
        Factory,
        signer
      )
      setFactory(factory)
    }

    loadBlockchainData()
  }, [])

  /*******************************************************
   *                                                     *
   *                    READ VALUES                      *
   *                                                     *
   * *****************************************************/

  const token0 = '0xd87ba7a50b2e7e660f678a895e4b72e7cb4ccd9c'
  const token1 = '0xdc31ee1784292379fbb2964b3b9c4124d8f89c60'
  const decimals0 = 6
  const decimals1 = 18
  const depositAmount0 = '100000000000000000000'
  const depositAmount1 = '100000000000000000000'
  const liquidity = '100000000'

  // Get current relative price between pool assets
  async function getCurrentPrice(token0, token1) {
    const pairAddress = await factory.getPair(token0, token1)
    const pair = new ethers.Contract(pairAddress, Pair, signer)
    const reserves = await pair.getReserves()
    return (
      ethers.utils.formatUnits(reserves._reserve0, decimals0) /
      ethers.utils.formatUnits(reserves._reserve1, decimals1)
    )
  }

  // Get amount1 from amount0
  async function getAmount1FromAmount0(token0, token1, amount0) {
    const pairAddress = await factory.getPair(token0, token1)
    const pair = new ethers.Contract(pairAddress, Pair, signer)
    const reserves = await pair.getReserves()
    const amount1 = await router.quote(
      amount0,
      reserves._reserve0,
      reserves._reserve1
    )
    return ethers.utils.formatUnits(amount1, decimals1)
  }

  /*******************************************************
   *                                                     *
   *                  TOKEN APPROVALS                    *
   *                                                     *
   * *****************************************************/

  const approveToken0Handler = async () => {
    const token = new ethers.Contract(token0, tokenABI.abi, signer)
    await token.approve(router.address, '50000000000000000000000000000')
  }

  const approveToken1Handler = async () => {
    const token = new ethers.Contract(token1, tokenABI.abi, signer)
    await token.approve(router.address, '50000000000000000000000000000')
  }

  /*******************************************************
   *                                                     *
   *                        ACTIONS                      *
   *                                                     *
   * *****************************************************/

  // Add liquidity to ERC20 - ERC20 pool
  const addLiquidityHandler = async () => {
    await router.addLiquidity(
      token0,
      token1,
      depositAmount0, // amount0Desired
      depositAmount1, // amount1Desired
      0, // amount0Min
      0, // amount1Min
      account, // who will hold the LP
      '100000000000' // deadline
    )
  }

  // Add liquidity to ERC20 - ETH pool
  const addLiquidityETHHandler = async () => {
    await router.addLiquidityETH(
      token0,
      depositAmount0, // amountTokenDesired
      0, // amountTokenMin
      0, // amountETHMin
      account, // who will hold the LP
      '100000000000', // deadline
      { value: '1000' }
    )
  }

  // Remove liquidity to ERC20 - ERC20 pool
  const removeLiquidityHandler = async () => {
    await router.removeLiquidity(
      token0,
      token1,
      liquidity, // LP amount
      0, // amount0Min
      0, // amount1Min
      account, // who will hold the underlyings
      '100000000000' // deadline
    )
  }

  // Remove liquidity to ERC20 - ERC20 pool
  const removeLiquidityETHHandler = async () => {
    await router.removeLiquidityETH(
      token0,
      liquidity, // LP amount
      0, // amountTokenMin
      0, // amountETHMin
      account, // who will hold the underlyings
      '100000000000' // deadline
    )
  }

  return (
    <React.Fragment>
      <h1>Uniswap V2</h1>
      <button className="btn btn-primary m-3" onClick={approveToken0Handler}>
        Token0 Approve
      </button>
      <button className="btn btn-primary m-3" onClick={approveToken1Handler}>
        Token1 Approve
      </button>
      <button className="btn btn-primary m-3" onClick={addLiquidityHandler}>
        Add liquidity (ERC20-ERC20)
      </button>
      <button className="btn btn-primary m-3" onClick={addLiquidityETHHandler}>
        Add liquidity (ERC20-ETH)
      </button>
      <button className="btn btn-primary m-3" onClick={removeLiquidityHandler}>
        Remove liquidity (ERC20-ERC20)
      </button>
      <button
        className="btn btn-primary m-3"
        onClick={removeLiquidityETHHandler}
      >
        Remove liquidity (ERC20-ETH)
      </button>
    </React.Fragment>
  )
}

export default App
