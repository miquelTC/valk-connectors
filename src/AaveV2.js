import React, { useEffect, useState } from 'react'
import { ethers } from 'ethers'
import addressProviderABI from './abi/aave/LendingPoolAddressesProvider.json'
import lendingPoolABI from './abi/aave/LendingPool.json'
import wethGatewayABI from './abi/aave/wethGateway.json'
import ICreditDelegationToken from './abi/aave/ICreditDelegationToken.json'
import incentivesControllerABI from './abi/aave/IncentivesController.json'
import stakedAaveABI from './abi/aave/stakedAave.json'
import tokenABI from './abi/IERC20.json'

const App = () => {
  const [account, setAccount] = useState(null)
  const [lendingPoolInstance, setLendingPoolInstance] = useState(null)
  const [totalSupply, setTotalSupply] = useState(null)
  const [totalDebt, setTotalDebt] = useState(null)
  const [ltv, setLtv] = useState(null)
  const [assetData, setAssetData] = useState(null)
  const [wethGatewayInstance, setWethGatewayInstance] = useState(null)
  const [provider, setProvider] = useState(null)
  const [signer, setSigner] = useState(null)
  const [stakedAave, setStakedAave] = useState(null)
  const [incentivesController, setIncentivesController] = useState(null)

  const DECIMALS = 10 ** 18
  const ether = (wei) => wei / DECIMALS

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
      setProvider(provider)

      await provider.send('eth_requestAccounts', [])
      const signer = provider.getSigner()
      setSigner(signer)

      // Load Account
      const accounts = await provider.listAccounts()
      setAccount(accounts[0])

      // Load Contracts
      const providerInstance = new ethers.Contract(
        '0x5E52dEc931FFb32f609681B8438A51c675cc232d',
        addressProviderABI,
        signer
      )
      const lendingPoolAddress = await providerInstance.getLendingPool()
      const lendingPoolInstance = new ethers.Contract(
        lendingPoolAddress,
        lendingPoolABI,
        signer
      )
      setLendingPoolInstance(lendingPoolInstance)

      const wethGatewayInstance = new ethers.Contract(
        '0x3bd3a20Ac9Ff1dda1D99C0dFCE6D65C4960B3627',
        wethGatewayABI,
        signer
      )
      setWethGatewayInstance(wethGatewayInstance)

      const incentivesController = new ethers.Contract(
        '0xd784927Ff2f95ba542BfC824c8a8a98F3495f6b5', // MAINNET
        incentivesControllerABI,
        signer
      )
      setIncentivesController(incentivesController)

      const stakedAave = new ethers.Contract(
        '0x4da27a545c0c5b758a6ba100e3a049001de870f5', // MAINNET
        stakedAaveABI,
        signer
      )
      setStakedAave(stakedAave)

      // Account Data
      const accountData = await lendingPoolInstance.getUserAccountData(
        accounts[0]
      )

      const etherPrice = 1500 // 1 / (usdPriceEth / 10 ** 18)
      console.log('etherPrice', etherPrice)

      // Total Collateral - LEND KPI
      const totalSupply = etherPrice * ether(accountData.totalCollateralETH)
      setTotalSupply(totalSupply)

      // Total Debt - BORROWED KPI
      const totalDebt = etherPrice * ether(accountData.totalDebtETH)
      setTotalDebt(totalDebt)

      // LTV (Loan To Value) - MAX % of the LEND amount that user can borrow. If the user supplies 100, he can borrows 75
      const ltv = accountData.ltv
      setLtv(ltv)
    }

    loadBlockchainData()
  }, [])

  /*******************************************************
   *                                                     *
   *                    READ VALUES                      *
   *                                                     *
   * *****************************************************/

  // User Data (healthFactor, borrowPower, totalSupplied, totalBorrowed...)
  async function getUserData() {
    const userData = await lendingPoolInstance.getUserAccountData(account)
    return {
      healthFactor: ethers.utils.formatEther(userData.healthFactor),
      ltv: ethers.utils.formatUnits(userData.ltv, 4),
      totalSupply: userData.totalCollateralETH, // returns in ETH, not in USD
      totalBorrow: userData.totalDebtETH, // returns in ETH, not in USD
      borrowPower:
        userData.totalCollateralETH * ethers.utils.formatUnits(userData.ltv, 4), // Be careful with units and decimals
      borrowPowerAvailable: userData.totalDebtETH, // returns in ETH, not in USD
    }
  }

  /*******************************************************
   *                                                     *
   *                      APPROVALS                      *
   *                                                     *
   * *****************************************************/

  // Token approval
  const aaveApprovalHandler = async () => {
    const hugeNumber =
      '1000000000000000000000000000000000000000000000000000000000'
    const tokenInstance = new ethers.Contract(
      '0x75Ab5AB1Eef154C0352Fc31D2428Cef80C7F8B33',
      tokenABI.abi,
      signer
    )
    const allowedAmount = await tokenInstance.allowance(
      account,
      lendingPoolInstance.address
    )
    console.log(allowedAmount)
    if (allowedAmount == 0) {
      await tokenInstance.approve(lendingPoolInstance.address, hugeNumber)
    }
  }

  // aWETH approval - Allow the Weth Gateway contract to burn aWeth, necessary for WITHDRAW
  const aaveAWethApprovalHandler = async () => {
    console.log(provider)
    const hugeNumber =
      '1000000000000000000000000000000000000000000000000000000000'
    const tokenInstance = new ethers.Contract(
      '0x22404b0e2a7067068acdadd8f9d586f834cce2c5',
      tokenABI.abi,
      signer
    )
    console.log(wethGatewayInstance.address)
    console.log(account)
    const allowedAmount = await tokenInstance.allowance(
      account,
      wethGatewayInstance.address
    )
    // if (allowedAmount == 0) {
    await tokenInstance.approve(wethGatewayInstance.address, hugeNumber)
    // }
  }

  // WETH Stable Credit Delegation - Necessary to borrow with stable rate
  const aaveCreditApprovalStableHandler = async () => {
    const hugeNumber =
      '1000000000000000000000000000000000000000000000000000000000'
    const tokenInstance = new ethers.Contract(
      '0x2D9038076C16F152B6Ab5391644DB8e3E88C3723',
      ICreditDelegationToken.abi,
      signer
    )
    const allowedAmount = await tokenInstance.borrowAllowance(
      account,
      wethGatewayInstance.address
    )
    console.log('allowed WETH', allowedAmount)
    if (allowedAmount == 0) {
      await tokenInstance.approveDelegation(
        wethGatewayInstance.address,
        hugeNumber
      )
    }
  }

  // WETH Variable Credit Delegation - Necessary to borrow with variable rate
  const aaveCreditApprovalVariableHandler = async () => {
    const hugeNumber =
      '1000000000000000000000000000000000000000000000000000000000'
    const tokenInstance = new ethers.Contract(
      '0xE3F7fEe1F71F1227007575931B62B94076549989',
      ICreditDelegationToken.abi,
      signer
    )
    const allowedAmount = await tokenInstance.borrowAllowance(
      account,
      wethGatewayInstance.address
    )
    console.log('allowed WETH', allowedAmount)
    if (allowedAmount == 0) {
      await tokenInstance.approveDelegation(
        wethGatewayInstance.address,
        hugeNumber
      )
    }
  }

  const daiAmount = '5000000000000000000'
  const etherAmount = '5000000000000000'
  const daiBorrowAmount = '2500000000000000000'
  const etherBorrowAmount = '2000000000000000'

  // Token deposit
  const aaveDepositHandler = async () => {
    await lendingPoolInstance.deposit(
      '0x75Ab5AB1Eef154C0352Fc31D2428Cef80C7F8B33',
      daiAmount,
      account,
      0
    )
  }

  // Ether deposit
  const aaveEtherDepositHandler = async () => {
    console.log('address', lendingPoolInstance.address)
    await wethGatewayInstance.depositETH(
      lendingPoolInstance.address,
      account,
      0,
      { value: '10000000000000000' }
    )
  }

  // Token withdraw (partial)
  const aaveWithdrawHandler = async () => {
    await lendingPoolInstance.withdraw(
      '0x75Ab5AB1Eef154C0352Fc31D2428Cef80C7F8B33',
      daiAmount,
      account
    )
  }

  // Token withdraw (FULL)
  const aaveWithdrawFullHandler = async () => {
    await lendingPoolInstance.withdraw(
      '0x75Ab5AB1Eef154C0352Fc31D2428Cef80C7F8B33',
      ethers.constants.MaxUint256,
      account
    )
  }

  // Ether withdraw (partial)
  const aaveEtherWithdrawHandler = async () => {
    await wethGatewayInstance.withdrawETH(
      lendingPoolInstance.address,
      etherAmount,
      account
    )
  }

  // Ether withdraw (FULL amount)
  const aaveEtherWithdrawFullHandler = async () => {
    await wethGatewayInstance.withdrawETH(
      lendingPoolInstance.address,
      ethers.constants.MaxUint256,
      account
    )
  }

  // Borrow token
  const aaveBorrowHandler = async () => {
    await lendingPoolInstance.borrow(
      '0x75Ab5AB1Eef154C0352Fc31D2428Cef80C7F8B33',
      daiBorrowAmount,
      2,
      0,
      account
    )
  }

  // Borrow Ether
  const aaveEtherBorrowHandler = async () => {
    await wethGatewayInstance.borrowETH(
      lendingPoolInstance.address,
      '2000000000000000',
      2,
      0
    )
  }

  // Token repay (partial)
  const aaveRepayHandler = async () => {
    await lendingPoolInstance.repay(
      '0x75Ab5AB1Eef154C0352Fc31D2428Cef80C7F8B33',
      daiBorrowAmount,
      2,
      account
    )
  }

  // Token repay (FULL)
  const aaveRepayFullHandler = async () => {
    await lendingPoolInstance.repay(
      '0x75Ab5AB1Eef154C0352Fc31D2428Cef80C7F8B33',
      ethers.constants.MaxUint256,
      2,
      account
    )
  }

  // Ether repay (partial)
  const aaveEtherRepayHandler = async () => {
    await wethGatewayInstance.repayETH(
      lendingPoolInstance.address,
      '1000000000000000',
      2,
      account
    )
  }

  // Ether repay (FULL)
  const aaveEtherRepayFullHandler = async () => {
    const tokenInstance = new ethers.Contract(
      '0xE3F7fEe1F71F1227007575931B62B94076549989',
      ICreditDelegationToken.abi,
      signer
    )
    const balance = await tokenInstance.balanceOf(account)
    const amount = Math.floor(balance * 1.001) // the exceeded amount is refunded automatically
    console.log('amount to repay', amount)
    await wethGatewayInstance.repayETH(
      lendingPoolInstance.address,
      ethers.constants.MaxUint256,
      1,
      account
    )
  }

  const aaveDisableCollateralHandler = async () => {
    const newBorrowPower =
      (totalSupply - assetData.supply[0].amountFiat) * (ltv / 10000)
    if (totalDebt <= newBorrowPower) {
      await lendingPoolInstance.setUserUseReserveAsCollateral(
        '0xff795577d9ac8bd7d90ee22b6c1703490b6512fd',
        false
      )
    }
  }

  const aaveEnableCollateralHandler = async () => {
    await lendingPoolInstance.setUserUseReserveAsCollateral(
      '0xff795577d9ac8bd7d90ee22b6c1703490b6512fd',
      true
    )
  }

  const aaveClaimHandler = async () => {
    await stakedAave.claimRewards(account, ethers.constants.MaxUint256)
    const claimAssets = [] // TODO: Calculate them (requires investigation)
    await incentivesController.claimRewards(
      claimAssets,
      account,
      ethers.constants.MaxUint256
    )
  }

  return (
    <React.Fragment>
      <h1>Aave</h1>
      <button className="btn btn-primary m-3" onClick={aaveApprovalHandler}>
        Approval
      </button>
      <button
        className="btn btn-primary m-3"
        onClick={aaveAWethApprovalHandler}
      >
        aWETH Approval (required to withdraw ETH)
      </button>
      <button
        className="btn btn-primary m-3"
        onClick={aaveCreditApprovalStableHandler}
      >
        Stable Credit Approval (required to borrow ETH with stable rate)
      </button>
      <button
        className="btn btn-primary m-3"
        onClick={aaveCreditApprovalVariableHandler}
      >
        Variable Credit Approval (required to borrow ETH with variable rate)
      </button>
      <button className="btn btn-primary m-3" onClick={aaveDepositHandler}>
        Deposit
      </button>
      <button className="btn btn-primary m-3" onClick={aaveEtherDepositHandler}>
        Ether Deposit
      </button>
      <button className="btn btn-primary m-3" onClick={aaveWithdrawHandler}>
        Token Withdraw (partial)
      </button>
      <button className="btn btn-primary m-3" onClick={aaveWithdrawFullHandler}>
        Token Withdraw (FULL)
      </button>
      <button
        className="btn btn-primary m-3"
        onClick={aaveEtherWithdrawHandler}
      >
        Ether Withdraw (partial)
      </button>
      <button
        className="btn btn-primary m-3"
        onClick={aaveEtherWithdrawFullHandler}
      >
        Ether Withdraw (FULL)
      </button>
      <button className="btn btn-primary m-3" onClick={aaveBorrowHandler}>
        Borrow
      </button>
      <button className="btn btn-primary m-3" onClick={aaveEtherBorrowHandler}>
        Ether Borrow
      </button>
      <button className="btn btn-primary m-3" onClick={aaveRepayHandler}>
        Token Repay (partial)
      </button>
      <button className="btn btn-primary m-3" onClick={aaveRepayFullHandler}>
        Token Repay (FULL)
      </button>
      <button className="btn btn-primary m-3" onClick={aaveEtherRepayHandler}>
        Ether Repay (partial)
      </button>
      <button
        className="btn btn-primary m-3"
        onClick={aaveEtherRepayFullHandler}
      >
        Ether Repay (FULL)
      </button>
      <button
        className="btn btn-primary m-3"
        onClick={aaveDisableCollateralHandler}
      >
        Disable Collateral
      </button>
      <button
        className="btn btn-primary m-3"
        onClick={aaveEnableCollateralHandler}
      >
        Enable Collateral
      </button>
      <button className="btn btn-primary m-3" onClick={aaveClaimHandler}>
        Claim rewards
      </button>
    </React.Fragment>
  )
}

export default App
