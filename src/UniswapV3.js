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

  // These are our examples on Goerli.
  // In reality, we will create ERC20 instance to retrieve Token parameters (synmbol, decimals...)
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

  // Get tokenIds (NFT id or position id) of a specific user
  async function getTokenIds(user) {
    const balance = await positionManager.balanceOf(user)
    const tokenIds = []
    for (let index = 0; index < balance; index++) {
      const tokenId = await positionManager.tokenOfOwnerByIndex(index)
      tokenIds.push(tokenId)
    }
    return tokenIds
  }

  // Get % Share (pool share)
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
  // In this example I am passing token0Decimals and token1Decimals. In reality we will use ERC20 instance to get this info
  // To calculate Liquidity USD, sum both token amounts multiplied by their USD rate
  async function getPositionData(tokenId, token0Decimals, token1Decimals) {
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
      token0: tokenA.address,
      token1: tokenB.address,
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
      feeTier: poolData.fee,
    }
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

  function getTickFromPrice(price, decimals0, decimals1) {
    return Math.floor(
      Math.log(price * Math.sqrt(10 ** (decimals0 + decimals1))) /
        Math.log(1.0001)
    )
  }

  function getPriceFromTick(tick, decimals0, decimals1) {
    const decimalsScale =
      tick > 0
        ? Math.sqrt(10 ** (decimals0 + decimals1))
        : Math.sqrt(10 ** -(decimals0 + decimals1))
    return Math.pow(1.0001, tick) / decimalsScale
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

  // Get the nearest price based on nearest tick
  function getNearestPrice(desiredPrice, tickSpacing, decimals0, decimals1) {
    const tick = getTickFromPrice(desiredPrice, decimals0, decimals1)
    console.log('tickFromPrice', tick)
    console.log('nearestTick', nearestUsableTick(tick, tickSpacing))
    const price = getPriceFromTick(
      nearestUsableTick(tick, tickSpacing),
      decimals0,
      decimals1
    )

    return price
  }

  // Get amount1 from amount0, given a range
  function getMintAmount1FromAmount0(
    tokenA,
    tokenB,
    currentPrice,
    priceUpper,
    tickLower,
    tickUpper,
    poolData,
    amount0
  ) {
    const liquidity = getLiquidityFromX(amount0, priceUpper, currentPrice)

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

    return position.mintAmounts.amount1.toString()
  }

  // Get amount0 from amount1, given a range
  function getMintAmount0FromAmount1(
    tokenA,
    tokenB,
    currentPrice,
    priceLower,
    tickLower,
    tickUpper,
    poolData,
    amount1
  ) {
    const liquidity = getLiquidityFromY(amount1, priceLower, currentPrice)

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

    return position.mintAmounts.amount0.toString()
  }

  // Get Ticks and Prices for Mint
  function getMintTicksAndPrices(
    poolData,
    priceLowerDesired,
    priceUpperDesired
  ) {
    const currentPrice = getPriceFromTick(
      poolData.tick,
      token0Decimals,
      token1Decimals
    )

    const priceLower = getNearestPrice(
      priceLowerDesired,
      poolData.tickSpacing,
      token0Decimals,
      token1Decimals
    )
    const priceUpper = getNearestPrice(
      priceUpperDesired,
      poolData.tickSpacing,
      token0Decimals,
      token1Decimals
    )
    const tickLower = getTickFromPrice(
      poolData.tick > 0
        ? priceLower
        : priceLower / 10 ** (token0Decimals + token1Decimals),
      token0Decimals,
      token1Decimals
    )

    const tickUpper = getTickFromPrice(
      poolData.tick > 0
        ? priceUpper
        : priceUpper / 10 ** (token0Decimals + token1Decimals),
      token0Decimals,
      token1Decimals
    )

    return {
      currentPrice,
      priceLower,
      priceUpper,
      tickLower,
      tickUpper,
    }
  }

  // Get Amounts to be minted
  function getMintAmounts(
    inputIndex,
    tokenA,
    tokenB,
    currentPrice,
    priceLower,
    priceUpper,
    tickLower,
    tickUpper,
    poolData,
    desiredAmount
  ) {
    let amount0
    let amount1
    if (inputIndex == 0) {
      amount0 = ethers.utils.parseUnits(
        desiredAmount,
        (token0Decimals + token1Decimals) / 2
      )
      amount1 = getMintAmount1FromAmount0(
        tokenA,
        tokenB,
        currentPrice,
        priceUpper,
        tickLower,
        tickUpper,
        poolData,
        amount0
      )
    } else {
      amount1 = ethers.utils.parseUnits(
        desiredAmount,
        (token0Decimals + token1Decimals) / 2
      )
      amount0 = getMintAmount0FromAmount1(
        tokenA,
        tokenB,
        currentPrice,
        priceLower,
        tickLower,
        tickUpper,
        poolData,
        amount1
      )
    }
    return [amount0, amount1]
  }

  // Mint NFT when adding liquidity first time for specific assets, feeTier and price range
  // MUST APPROVE TOKENS BEFORE!!
  // Normally inputs will be token0Address, token1Address, feeTier, priceLowerDesired, priceUpperDesired, inputIndex, desiredAmount
  // In this example, I am hardcoding the inputs
  async function createNftHandler() {
    // Inputs hardcoded for this example
    const priceLowerDesired = 100
    const priceUpperDesired = 150
    const inputIndex = 0
    const desiredAmount = '45'
    const feeTier = '500'

    const tokenA = new Token(5, token0Address, token0Decimals)
    const tokenB = new Token(5, token1Address, token1Decimals)

    const currentPoolAddress = computePoolAddress({
      factoryAddress: '0x1F98431c8aD98523631AE4a59f267346ea31F984', // same in all chains
      tokenA: tokenA,
      tokenB: tokenB,
      fee: feeTier,
    })
    console.log('currentPoolAddress', currentPoolAddress)

    const poolContract = new ethers.Contract(
      currentPoolAddress,
      UniswapV3Pool,
      signer
    )

    const poolData = await getPoolData(poolContract)

    const { currentPrice, priceLower, priceUpper, tickLower, tickUpper } =
      getMintTicksAndPrices(poolData, priceLowerDesired, priceUpperDesired)

    const [amount0, amount1] = getMintAmounts(
      inputIndex,
      tokenA,
      tokenB,
      currentPrice,
      priceLower,
      priceUpper,
      tickLower,
      tickUpper,
      poolData,
      desiredAmount
    )

    await positionManager.mint([
      token0Address,
      token1Address,
      poolData.fee,
      nearestUsableTick(tickLower, poolData.tickSpacing),
      nearestUsableTick(tickUpper, poolData.tickSpacing),
      inputIndex == 0
        ? ethers.utils.parseUnits(desiredAmount, token0Decimals)
        : ethers.BigNumber.from(amount0).mul(100).div(100),
      inputIndex == 1
        ? ethers.utils.parseUnits(desiredAmount, token1Decimals)
        : ethers.BigNumber.from(amount1).mul(100).div(100),
      inputIndex == 0
        ? ethers.utils
            .parseUnits(desiredAmount, token0Decimals)
            .mul(98)
            .div(100)
        : ethers.BigNumber.from(amount0).mul(95).div(100),
      inputIndex == 1
        ? ethers.utils
            .parseUnits(desiredAmount, token1Decimals)
            .mul(98)
            .div(100)
        : ethers.BigNumber.from(amount1).mul(95).div(100),
      account,
      Math.floor(Date.now() / 1000) + 60 * 10,
    ])
  }

  // Mint NFT when adding liquidity first time for specific assets, feeTier and price range
  // MUST APPROVE TOKENS BEFORE!!
  // Normally inputs will be token0Address, token1Address, feeTier, priceLowerDesired, priceUpperDesired, inputIndex, desiredAmount
  // In this example, I am hardcoding the inputs
  async function createNftEthHandler() {
    // Inputs hardcoded for this example
    const priceLowerDesired = 20758000000
    const priceUpperDesired = 200700000000
    const inputIndex = 0
    const desiredAmount = '0.000001'
    const feeTier = '500'
    const token0Address = '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6'
    const token1Address = '0xD87Ba7A50B2E7E660f678A895E4B72E7CB4CCd9C'
    const token0Decimals = 18
    const token1Decimals = 6

    const tokenA = new Token(5, token0Address, token0Decimals)
    const tokenB = new Token(5, token1Address, token1Decimals)

    const currentPoolAddress = computePoolAddress({
      factoryAddress: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      tokenA: tokenA,
      tokenB: tokenB,
      fee: feeTier,
    })

    const poolContract = new ethers.Contract(
      currentPoolAddress,
      UniswapV3Pool,
      signer
    )

    const poolData = await getPoolData(poolContract)

    const { currentPrice, priceLower, priceUpper, tickLower, tickUpper } =
      getMintTicksAndPrices(poolData, priceLowerDesired, priceUpperDesired)

    const [amount0, amount1] = getMintAmounts(
      inputIndex,
      tokenA,
      tokenB,
      currentPrice,
      priceLower,
      priceUpper,
      tickLower,
      tickUpper,
      poolData,
      desiredAmount
    )
    const value =
      inputIndex == 0
        ? token0Address == '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6' // WETH
          ? ethers.utils.parseUnits(desiredAmount, token0Decimals)
          : ethers.BigNumber.from(amount1.toString()).mul(105).div(100)
        : token1Address == '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6' // WETH
        ? ethers.utils.parseUnits(desiredAmount, token1Decimals)
        : ethers.BigNumber.from(amount0).mul(105).div(100)

    // Multicall parameters
    const positionManagerInterface = new ethers.utils.Interface(PositionManager)

    const mintArgs = [
      token0Address,
      token1Address,
      poolData.fee,
      nearestUsableTick(tickLower, poolData.tickSpacing),
      nearestUsableTick(tickUpper, poolData.tickSpacing),
      inputIndex == 0
        ? ethers.utils.parseUnits(desiredAmount, token0Decimals)
        : ethers.BigNumber.from(amount0.toString()).mul(100).div(100),
      inputIndex == 1
        ? desiredAmount * 10 ** token1Decimals
        : ethers.BigNumber.from(amount1.toString()).mul(100).div(100),
      inputIndex == 0
        ? ethers.utils
            .parseUnits(desiredAmount, token0Decimals)
            .mul(98)
            .div(100)
        : ethers.BigNumber.from(amount0.toString()).mul(95).div(100),
      inputIndex == 1
        ? ethers.utils
            .parseUnits(desiredAmount, token1Decimals)
            .mul(98)
            .div(100)
        : ethers.BigNumber.from(amount1.toString()).mul(95).div(100),
      account,
      Math.floor(Date.now() / 1000) + 60 * 10,
    ]

    const mintData = positionManagerInterface.encodeFunctionData('mint', [
      mintArgs,
    ])

    const refundData = positionManagerInterface.encodeFunctionData(
      'refundETH',
      []
    )
    await positionManager.multicall([mintData, refundData], {
      value,
    })
  }

  /*******************************************************
   *                                                     *
   *                    ADD LIQUIDITY                    *
   *                                                     *
   * *****************************************************/

  // Get Amount1 when Amount0 is provided to add liquidity
  // IN this example I provide token0Decimals and token1Decimals to simplify. In reality we'll use ERC20 interface
  async function getPositionAmount1FromAmount0(
    tokenId,
    amount0,
    token0Decimals,
    token1Decimals
  ) {
    const positionData = await getPositionData(
      tokenId,
      token0Decimals,
      token1Decimals
    )
    const ratio = amount0 / positionData.amount0

    return ethers.utils.parseUnits(
      (ratio * positionData.amount1).toFixed(token1Decimals),
      token1Decimals
    )
  }

  // Get Amount0 when Amount1 is provided to add liquidity
  async function getPositionAmount0FromAmount1(
    tokenId,
    amount1,
    token0Decimals,
    token1Decimals
  ) {
    const positionData = await getPositionData(
      tokenId,
      token0Decimals,
      token1Decimals
    )
    const ratio = amount1 / positionData.amount1

    return ethers.utils.parseUnits(
      (ratio * positionData.amount0).toFixed(token0Decimals),
      token0Decimals
    )
  }

  // inputs will be NFT ID, inputIndex, amount0Desired or amount1Desired
  // MUST APPROVE TOKENS BEFORE!!
  async function increaseLiquidityHandler() {
    // Hardcoded inputs
    const tokenId = 67073
    const desiredAmount = '30'
    const inputIndex = 0

    const amount0 =
      inputIndex == 0
        ? ethers.utils.parseUnits(desiredAmount, token0Decimals)
        : await getPositionAmount0FromAmount1(
            tokenId,
            desiredAmount,
            token0Decimals,
            token1Decimals
          )
    const amount1 =
      inputIndex == 1
        ? ethers.utils.parseUnits(desiredAmount, token1Decimals)
        : await getPositionAmount1FromAmount0(
            tokenId,
            desiredAmount,
            token0Decimals,
            token1Decimals
          )

    await positionManager.increaseLiquidity([
      tokenId,
      amount0,
      amount1,
      amount0.mul(95).div(100),
      amount1.mul(95).div(100),
      Math.floor(Date.now() / 1000) + 60 * 10,
    ])
  }

  // inputs will be NFT ID, inputIndex, amount0Desired or amount1Desired
  // MUST APPROVE TOKENS BEFORE!!
  async function increaseLiquidityEthHandler() {
    // Hardcoded inputs
    const tokenId = 67260
    const desiredAmount = '0.000001'
    const inputIndex = 0
    const token0Address = '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6'
    const token1Address = '0xD87Ba7A50B2E7E660f678A895E4B72E7CB4CCd9C'
    const token0Decimals = 18
    const token1Decimals = 6

    const amount0 =
      inputIndex == 0
        ? ethers.utils.parseUnits(desiredAmount, token0Decimals)
        : await getPositionAmount0FromAmount1(
            tokenId,
            desiredAmount,
            token0Decimals,
            token1Decimals
          )
    const amount1 =
      inputIndex == 1
        ? ethers.utils.parseUnits(desiredAmount, token1Decimals)
        : await getPositionAmount1FromAmount0(
            tokenId,
            desiredAmount,
            token0Decimals,
            token1Decimals
          )
    const value =
      inputIndex == 0
        ? token0Address == '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6' // WETH
          ? ethers.utils.parseUnits(desiredAmount, token0Decimals)
          : ethers.BigNumber.from(amount1.toString()).mul(105).div(100)
        : token1Address == '0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6' // WETH
        ? ethers.utils.parseUnits(desiredAmount, token1Decimals)
        : ethers.BigNumber.from(amount0).mul(105).div(100)

    // Multicall parameters
    const positionManagerInterface = new ethers.utils.Interface(PositionManager)

    const increaseLiquidityArgs = [
      tokenId,
      amount0,
      amount1,
      amount0.mul(95).div(100),
      amount1.mul(95).div(100),
      Math.floor(Date.now() / 1000) + 60 * 10,
    ]

    const increaseLiquidityData = positionManagerInterface.encodeFunctionData(
      'increaseLiquidity',
      [increaseLiquidityArgs]
    )

    const refundData = positionManagerInterface.encodeFunctionData(
      'refundETH',
      []
    )
    await positionManager.multicall([increaseLiquidityData, refundData], {
      value,
    })
  }

  /*******************************************************
   *                                                     *
   *                  REMOVE LIQUIDITY                   *
   *                                                     *
   * *****************************************************/

  // inputs will be NFT ID, liquidity percentage
  // We use multicall because we withdraw + collect
  const decreaseLiquidityHandler = async () => {
    // Hardcode inputs for our example
    const tokenId = 67073
    const percentage = 50

    const position = await positionManager.positions(tokenId)
    const liquidity = position.liquidity.toString()

    const positionManagerInterface = new ethers.utils.Interface(PositionManager)

    const decreaseLiquidityArgs = [
      tokenId,
      ethers.BigNumber.from(liquidity).mul(percentage).div(100),
      0,
      0,
      Math.floor(Date.now() / 1000) + 60 * 10,
    ]
    const decreaseLiquidityData = positionManagerInterface.encodeFunctionData(
      'decreaseLiquidity',
      [decreaseLiquidityArgs]
    )

    const collectArgs = [
      tokenId,
      account,
      '340282366920938463463374607431768211455',
      '340282366920938463463374607431768211455',
    ]
    const collectData = positionManagerInterface.encodeFunctionData('collect', [
      collectArgs,
    ])
    await positionManager.multicall([decreaseLiquidityData, collectData])
  }

  // inputs will be NFT ID, liquidity percentage
  // We use multicall because we withdraw + collect
  const decreaseLiquidityEthHandler = async () => {
    // Hardcode inputs for our example
    const tokenId = 67260
    const percentage = 50

    const position = await positionManager.positions(tokenId)
    const liquidity = position.liquidity.toString()

    const positionManagerInterface = new ethers.utils.Interface(PositionManager)

    const decreaseLiquidityArgs = [
      tokenId,
      ethers.BigNumber.from(liquidity).mul(percentage).div(100),
      0,
      0,
      Math.floor(Date.now() / 1000) + 60 * 10,
    ]
    const decreaseLiquidityData = positionManagerInterface.encodeFunctionData(
      'decreaseLiquidity',
      [decreaseLiquidityArgs]
    )
    const collectArgs = [
      tokenId,
      account,
      '340282366920938463463374607431768211455',
      '340282366920938463463374607431768211455',
    ]
    const collectData = positionManagerInterface.encodeFunctionData('collect', [
      collectArgs,
    ])

    const unwrapWethArgs = [0, account]
    const unwrapWethData = positionManagerInterface.encodeFunctionData(
      'unwrapWETH9',
      unwrapWethArgs
    )
    await positionManager.multicall([
      decreaseLiquidityData,
      collectData,
      unwrapWethData,
    ])
  }

  /*******************************************************
   *                                                     *
   *                    CLAIM REWARDS                    *
   *                                                     *
   * *****************************************************/

  async function claimAllHandler() {
    const tokenIds = await getTokenIds(account)
    for (const tokenId of tokenIds) {
      await positionManager.collect([
        tokenId,
        account,
        '999999999999999999999999999',
        '999999999999999999999999999',
      ])
    }
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
      <button className="btn btn-primary m-3" onClick={createNftEthHandler}>
        Create NFR (ETH-ERC20)
      </button>
      <button
        className="btn btn-primary m-3"
        onClick={increaseLiquidityHandler}
      >
        Add liquidity (ERC20-ERC20)
      </button>
      <button
        className="btn btn-primary m-3"
        onClick={increaseLiquidityEthHandler}
      >
        Add liquidity (ETH-ERC20)
      </button>
      <button
        className="btn btn-primary m-3"
        onClick={decreaseLiquidityHandler}
      >
        Remove liquidity (ERC20-ERC20)
      </button>
      <button
        className="btn btn-primary m-3"
        onClick={decreaseLiquidityEthHandler}
      >
        Remove liquidity (ETH-ERC20)
      </button>
      <button className="btn btn-primary m-3" onClick={claimAllHandler}>
        Claim All
      </button>
    </React.Fragment>
  )
}

export default App
