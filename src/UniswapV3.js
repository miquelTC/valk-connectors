import React, { useEffect, useState } from 'react'
import { ethers } from 'ethers'
import tokenABI from './abi/IERC20.json'
import PositionManager from './abi/uniswapv3/PositionManager.json'
import {
  computePoolAddress,
  Pool,
  Position,
  nearestUsableTick,
} from '@uniswap/v3-sdk'
import { Token } from '@uniswap/sdk-core'
import UniswapV3Pool from './abi/uniswapv3/UniswapV3Pool.json'
import UniswapV3Factory from './abi/uniswapv3/UniswapV3Factory.json'
import Quoter from './abi/uniswapv3/Quoter.json'

const App = () => {
  const [account, setAccount] = useState(null)
  const [positionManager, setPositionManager] = useState(null)
  const [factory, setFactory] = useState(null)
  const [quoter, setQuoter] = useState(null)
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
      const positionManager = new ethers.Contract(
        '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
        PositionManager,
        signer
      )
      setPositionManager(positionManager)

      const factory = new ethers.Contract(
        '0x1F98431c8aD98523631AE4a59f267346ea31F984',
        UniswapV3Factory,
        signer
      )
      setFactory(factory)

      const quoter = new ethers.Contract(
        '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
        Quoter,
        signer
      )
      setQuoter(quoter)
    }

    loadBlockchainData()
  }, [])

  /*******************************************************
   *                                                     *
   *                    READ VALUES                      *
   *                                                     *
   * *****************************************************/

  const token0Address = '0xd87ba7a50b2e7e660f678a895e4b72e7cb4ccd9c' // USDC
  const token1Address = '0xdc31ee1784292379fbb2964b3b9c4124d8f89c60' // DAI
  const token0Decimals = 6
  const token1Decimals = 18

  // Get current internalPrice for a specific pool
  async function getCurrentPrice(poolAddress) {
    const poolContract = new ethers.Contract(poolAddress, UniswapV3Pool, signer)
    const [token0, token1, fee] = await Promise.all([
      poolContract.token0(),
      poolContract.token1(),
      poolContract.fee(),
    ])

    const amountIn = ethers.utils.parseUnits('1', token0Decimals)
    const quotedAmount = await quoter.callStatic.quoteExactInputSingle(
      token0,
      token1,
      fee,
      amountIn,
      0
    )
    return ethers.utils.formatEther(quotedAmount).toString()
  }

  // Get tokenIds of a specific user
  async function getTokenIds(user) {
    const balance = await positionManager.balanceOf(user)
    const tokenIds = []
    for (let index = 0; index < balance; index++) {
      const tokenId = await positionManager.tokenOfOwnerByIndex(index)
      tokenIds.push(tokenId)
    }
    return tokenIds
  }

  // Get % Share
  async function getSharePct(tokenId) {
    const currentPosition = await positionManager.positions(tokenId)
    const liquidity = currentPosition.liquidity
    const poolAddress = factory.getPool(
      currentPosition.token0,
      currentPosition.token1,
      currentPosition.fee
    )
    const poolContract = new ethers.Contract(poolAddress, UniswapV3Pool, signer)
    const totalLiquidity = await poolContract.liquidity()
    return (+liquidity.toString() / +totalLiquidity.toString()) * 100
  }

  // Get Position data (prices and amounts)
  async function getPositionData(tokenId) {
    const currentPosition = await positionManager.positions(tokenId)
    const tokenA = new Token(5, currentPosition.token0, token0Decimals)
    const tokenB = new Token(5, currentPosition.token1, token1Decimals)

    const currentPoolAddress = computePoolAddress({
      factoryAddress: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      tokenA: tokenA,
      tokenB: tokenB,
      fee: '500',
    })

    const poolContract = new ethers.Contract(
      currentPoolAddress,
      UniswapV3Pool,
      signer
    )

    const poolData = await getPoolData(poolContract)
    const currentPrice = await getCurrentPrice(currentPoolAddress)

    const pool = new Pool(
      tokenA,
      tokenB,
      poolData.fee,
      poolData.sqrtPriceX96.toString(),
      poolData.liquidity.toString(),
      poolData.tick
    )

    const position = new Position({
      pool,
      liquidity: currentPosition.liquidity,
      tickLower: currentPosition.tickLower,
      tickUpper: currentPosition.tickUpper,
    })

    const priceLower = ethers.utils
      .formatUnits(
        Math.floor(1.0001 ** currentPosition.tickLower).toString(),
        (token0Decimals + token1Decimals) / 2
      )
      .toString()
    const priceUpper = ethers.utils
      .formatUnits(
        Math.floor(1.0001 ** currentPosition.tickUpper).toString(),
        (token0Decimals + token1Decimals) / 2
      )
      .toString()

    return {
      priceLower,
      priceUpper,
      currentPrice,
      amount0: ethers.utils.formatUnits(
        position.amount0.quotient.toString(),
        token0Decimals
      ),
      amount1: ethers.utils.formatUnits(
        position.amount1.quotient.toString(),
        token1Decimals
      ),
    }
  }

  // Get Amount1 when Amount0 is provided to add liquidity
  async function getPositionAmount1(tokenId, amount0) {
    const positionData = await getPositionData(tokenId)
    const ratio = amount0 / positionData.amount0
    console.log(ratio * positionData.amount1)
    return ratio * positionData.amount1
  }

  async function getPoolData(poolContract) {
    const [fee, tickSpacing, liquidity, slot0] = await Promise.all([
      poolContract.fee(),
      poolContract.tickSpacing(),
      poolContract.liquidity(),
      poolContract.slot0(),
    ])

    return {
      tickSpacing,
      fee,
      liquidity,
      sqrtPriceX96: slot0[0],
      tick: slot0[1],
    }
  }

  function getTickFromPrice(price, tickSpacing, decimals0, decimals1) {
    return nearestUsableTick(
      Math.floor(
        Math.log(price * 10 ** ((decimals0 + decimals1) / 2)) / Math.log(1.0001)
      ),
      tickSpacing
    )
  }

  function getLiquidityFromX(amount, priceUpper, priceCurrent) {
    return Math.floor(
      ((Math.sqrt(priceUpper) * Math.sqrt(priceCurrent)) /
        (Math.sqrt(priceUpper) - Math.sqrt(priceCurrent))) *
        amount
    )
  }

  function getLiquidityFromY(amount, priceLower, priceCurrent) {
    return amount / (Math.sqrt(priceCurrent) - Math.sqrt(priceLower))
  }

  async function getClaimableAmounts(tokenId) {
    return await positionManager.callStatic.collect([
      tokenId,
      account,
      '999999999999999999999999999',
      '999999999999999999999999999',
    ])
  }

  /*******************************************************
   *                                                     *
   *                      APPROVALS                      *
   *                                                     *
   * *****************************************************/

  const approveToken0Handler = async () => {
    const token = new ethers.Contract(token0Address, tokenABI.abi, signer)
    await token.approve(
      positionManager.address,
      '50000000000000000000000000000'
    )
  }

  const approveToken1Handler = async () => {
    const token = new ethers.Contract(token1Address, tokenABI.abi, signer)
    await token.approve(
      positionManager.address,
      '50000000000000000000000000000'
    )
  }

  /*******************************************************
   *                                                     *
   *                    MINT NFT                         *
   *                                                     *
   * *****************************************************/

  const createNftHandler = async () => {
    // inputs will be token0Address, token1Address, feeTier and Amount0 or Amount1
    const tokenA = new Token(5, token0Address, token0Decimals)
    const tokenB = new Token(5, token1Address, token1Decimals)

    const priceLower = 16.67 //* 10 ** 12
    const priceUpper = 39.98 // * 10 ** 12

    const currentPoolAddress = computePoolAddress({
      factoryAddress: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      tokenA: tokenA,
      tokenB: tokenB,
      fee: '500',
    })

    const currentPrice = getCurrentPrice(currentPoolAddress)

    const poolContract = new ethers.Contract(
      currentPoolAddress,
      UniswapV3Pool,
      signer
    )

    const poolData = await getPoolData(poolContract)

    const liquidity = getLiquidityFromX(45000000, priceUpper, currentPrice)

    const tickLower = getTickFromPrice(priceLower, poolData.tickSpacing, 6, 18)
    const tickUpper = getTickFromPrice(priceUpper, poolData.tickSpacing, 6, 18)
    console.log(
      'tickLowTEst',
      Math.floor(Math.log(priceLower * 10 ** (24 / 2)) / Math.log(1.0001))
    )

    console.log('liquidity', liquidity)
    console.log('priceUpper', priceUpper)
    console.log('currentPrice', currentPrice)
    console.log('priceLower', priceLower)

    const pool = new Pool(
      tokenA,
      tokenB,
      poolData.fee,
      poolData.sqrtPriceX96.toString(),
      poolData.liquidity.toString(),
      poolData.tick
    )

    const position = new Position({
      pool,
      liquidity,
      tickLower: nearestUsableTick(tickLower, poolData.tickSpacing),
      tickUpper: nearestUsableTick(tickUpper, poolData.tickSpacing),
    })

    const { amount0: amount0Desired, amount1: amount1Desired } =
      position.mintAmounts

    console.log(
      'desiredAmounts',
      amount0Desired.toString(),
      amount1Desired.toString()
    )
    console.log('tickLower', nearestUsableTick(tickLower, poolData.tickSpacing))
    console.log('tickUpper', nearestUsableTick(tickUpper, poolData.tickSpacing))
    console.log('currentTick', poolData.tick)

    const params = [
      token0Address,
      token1Address,
      poolData.fee,
      nearestUsableTick(tickLower, poolData.tickSpacing),
      nearestUsableTick(tickUpper, poolData.tickSpacing),
      amount0Desired.toString(),
      amount1Desired.toString(),
      amount0Desired.toString(),
      amount1Desired.toString(),
      account,
      Math.floor(Date.now() / 1000) + 60 * 10,
    ]

    await positionManager.mint(params)
  }

  /*******************************************************
   *                                                     *
   *                    ADD LIQUIDITY                    *
   *                                                     *
   * *****************************************************/

  const increaseLiquidityHandler = async () => {
    // inputs will be NFT ID, amount0Desired or amount1Desired
    const tokenId = 57649
    const amount0Desired = 45000000

    const currentPosition = await positionManager.positions(tokenId)

    const tokenA = new Token(5, currentPosition.token0, 6)
    const tokenB = new Token(5, currentPosition.token1, 18)

    const currentPoolAddress = computePoolAddress({
      factoryAddress: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      tokenA: tokenA,
      tokenB: tokenB,
      fee: currentPosition.fee,
    })

    const poolContract = new ethers.Contract(
      currentPoolAddress,
      UniswapV3Pool,
      signer
    )

    const poolData = await getPoolData(poolContract)

    const pool = new Pool(
      tokenA,
      tokenB,
      poolData.fee,
      poolData.sqrtPriceX96.toString(),
      poolData.liquidity.toString(),
      poolData.tick
    )

    const position = new Position({
      pool,
      liquidity: currentPosition.liquidity,
      tickLower: currentPosition.tickLower,
      tickUpper: currentPosition.tickUpper,
    })

    const newLiquidity = Math.floor(
      (amount0Desired / position.amount0.quotient.toString()) *
        currentPosition.liquidity
    )

    const positionToAdd = new Position({
      pool,
      liquidity: newLiquidity,
      tickLower: currentPosition.tickLower,
      tickUpper: currentPosition.tickUpper,
    })

    console.log(positionToAdd.amount0.quotient.toString())
    console.log(positionToAdd.amount1.quotient.toString())

    const params = [
      tokenId,
      positionToAdd.amount0.quotient.toString(),
      positionToAdd.amount1.quotient.toString(),
      (positionToAdd.amount0.quotient.toString() * 0.98).toString(),
      (positionToAdd.amount1.quotient.toString() * 0.98).toString(),
      Math.floor(Date.now() / 1000) + 60 * 10,
    ]

    await positionManager.increaseLiquidity(params)
  }

  /*******************************************************
   *                                                     *
   *                  REMOVE LIQUIDITY                   *
   *                                                     *
   * *****************************************************/

  const decreaseLiquidityHandler = async () => {
    // inputs will be NFT ID, liquidity percentage
    const tokenId = 57649
    const percentage = 0.5

    const position = await positionManager.positions(tokenId)
    const liquidity = position.liquidity.toString()

    const params = [
      tokenId,
      Math.floor(liquidity * percentage),
      0,
      0,
      Math.floor(Date.now() / 1000) + 60 * 10,
    ]

    await positionManager.decreaseLiquidity(params)
  }

  /*******************************************************
   *                                                     *
   *                    CLAIM REWARDS                    *
   *                                                     *
   * *****************************************************/

  async function claimAllHandler() {
    // const tokenIds = await getTokenIds(account)
    // for (const tokenId of tokenIds) {
    //   await positionManager.collect([
    //     tokenId,
    //     account,
    //     '999999999999999999999999999',
    //     '999999999999999999999999999',
    //   ])
    // }
    const share = await getSharePct('57649')
    console.log(share)
  }

  return (
    <React.Fragment>
      <h1>Uniswap V3</h1>
      <button className="btn btn-primary m-3" onClick={approveToken0Handler}>
        Token0 Approve
      </button>
      <button className="btn btn-primary m-3" onClick={approveToken1Handler}>
        Token1 Approve
      </button>
      <button className="btn btn-primary m-3" onClick={createNftHandler}>
        Create NFT (ERC20-ERC20)
      </button>
      <button
        className="btn btn-primary m-3"
        onClick={increaseLiquidityHandler}
      >
        Add liquidity (ERC20-ERC20)
      </button>
      {/* <button className="btn btn-primary m-3" onClick={addLiquidityETHHandler}>
        Add liquidity (ERC20-ETH)
      </button> */}
      <button
        className="btn btn-primary m-3"
        onClick={decreaseLiquidityHandler}
      >
        Remove liquidity (ERC20-ERC20)
      </button>
      {/* <button
        className="btn btn-primary m-3"
        onClick={removeLiquidityETHHandler}
      >
        Remove liquidity (ERC20-ETH)
      </button> */}
      <button className="btn btn-primary m-3" onClick={claimAllHandler}>
        Claim All
      </button>
    </React.Fragment>
  )
}

export default App
