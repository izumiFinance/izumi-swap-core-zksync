const { expect } = require("chai");
const { ethers } = require("hardhat");
const {getPoolParts} = require("./funcs.js");
const BigNumber = require('bignumber.js');

async function getToken() {

    // deploy token
    const tokenFactory = await ethers.getContractFactory("Token")
    tokenX = await tokenFactory.deploy('a', 'a');
    await tokenX.deployed();
    tokenY = await tokenFactory.deploy('b', 'b');
    await tokenY.deployed();

    txAddr = tokenX.address.toLowerCase();
    tyAddr = tokenY.address.toLowerCase();

    if (txAddr > tyAddr) {
      tmpAddr = tyAddr;
      tyAddr = txAddr;
      txAddr = tmpAddr;

      tmpToken = tokenY;
      tokenY = tokenX;
      tokenX = tmpToken;
    }
    
    return [tokenX, tokenY];
}

async function addLiquidity(testMint, miner, tokenX, tokenY, fee, pl, pr, liquidity) {
  amountX = await tokenX.balanceOf(miner.address);
  amountY = await tokenY.balanceOf(miner.address);
  await tokenX.connect(miner).approve(testMint.address, amountX);
  await tokenY.connect(miner).approve(testMint.address, amountY);
  await testMint.connect(miner).mint(tokenX.address, tokenY.address, fee, pl, pr, liquidity);
}

function l2y(liquidity, tick, rate, up) {
    price = rate.pow(tick);
    y = liquidity.times(price.sqrt());
    if (up) {
        return BigNumber(y.toFixed(0, 2));
    } else {
        return BigNumber(y.toFixed(0, 3));
    }
}

function l2x(liquidity, tick, rate, up) {
    price = rate.pow(tick);
    x = liquidity.div(price.sqrt());
    if (up) {
        return BigNumber(x.toFixed(0, 2));
    } else {
        return BigNumber(x.toFixed(0, 3));
    }
}

function floor(a) {
    return BigNumber(a.toFixed(0, 3));
}
function ceil(b) {
    return BigNumber(b.toFixed(0, 2));
}

function x2l(x, tick, rate, up) {
    const price = rate.pow(tick);
    const l = x.times(price.sqrt());
    if (up) {
        return ceil(l);
    } else {
        return floor(l);
    }
}

function y2l(y, tick, rate, up) {
    const price = rate.pow(tick);
    const l = y.div(price.sqrt());
    if (up) {
        return ceil(l);
    } else {
        return floor(l);
    }
}
function y2xAtLiquidity(point, rate, amountY, liquidity, liquidityX) {
    const maxLiquidityX = y2l(amountY, point, rate, false);

    const transformLiquidityY = liquidityX.gt(maxLiquidityX) ? maxLiquidityX : liquidityX;
    const acquireX = l2x(transformLiquidityY, point, rate, false);
    const costY = l2y(transformLiquidityY, point, rate, true);
    return [acquireX, costY, liquidityX.minus(transformLiquidityY)];
}

async function printState(poolAddr) {
    const iZiSwapPool = await ethers.getContractFactory("iZiSwapPool");
    pool = await iZiSwapPool.attach(poolAddr);
    const {sqrtPrice_96, currentPoint, liquidity, liquidityX, locked} = await pool.state();
    return [currentPoint, BigNumber(liquidity._hex), BigNumber(liquidityX._hex)]
}

function y2xAt(point, rate, amountY) {
    sp = rate.pow(point).sqrt();
    liquidity = floor(amountY.div(sp));
    acquireX = floor(liquidity.div(sp));
    liquidity = ceil(acquireX.times(sp));
    costY = ceil(liquidity.times(sp));
    return [acquireX, costY];
}
function x2yAt(point, rate, amountX) {
    sp = rate.pow(point).sqrt();
    liquidity = ceil(amountX.times(sp));
    costY = ceil(liquidity.times(sp));
    return costY;
}

function yInRange(liquidity, pl, pr, rate, up) {
    amountY = BigNumber("0");
    price = rate.pow(pl);
    for (var i = pl; i < pr; i ++) {
        amountY = amountY.plus(liquidity.times(price.sqrt()));
        price = price.times(rate);
    }
    if (up) {
        return ceil(amountY);
    } else {
        return floor(amountY);
    }
}
function xInRange(liquidity, pl, pr, rate, up) {
    amountX = BigNumber("0");
    price = rate.pow(pl);
    for (var i = pl; i < pr; i ++) {
        amountX = amountX.plus(liquidity.div(price.sqrt()));
        price = price.times(rate);
    }
    if (up) {
        return ceil(amountX);
    } else {
        return floor(amountX);
    }
}
function blockNum2BigNumber(blc) {
    return BigNumber(blc._hex);
}
function amountAddFee(amount) {
    return ceil(amount.times(1000).div(997));
}

describe("swap", function () {
  it("swap no limorder y2x range complex", async function () {
    const [signer, miner1, miner2, miner3, trader, trader2, receiver] = await ethers.getSigners();

    const {swapX2YModule, swapY2XModule, liquidityModule, limitOrderModule, flashModule} = await getPoolParts();
    // deploy a factory
    const iZiSwapFactory = await ethers.getContractFactory("iZiSwapFactory");

    const factory = await iZiSwapFactory.deploy(receiver.address, swapX2YModule, swapY2XModule, liquidityModule, limitOrderModule, flashModule, 50);
    await factory.deployed();

    await factory.enableFeeAmount(3000, 50);
    [tokenX, tokenY] = await getToken();
    txAddr = tokenX.address.toLowerCase();
    tyAddr = tokenY.address.toLowerCase();

    await tokenX.transfer(miner1.address, 10000000000);
    await tokenY.transfer(miner1.address, 20000000000);
    await tokenX.transfer(miner2.address, 30000000000);
    await tokenY.transfer(miner2.address, 40000000000);
    await tokenX.transfer(miner3.address, 50000000000);
    await tokenY.transfer(miner3.address, 60000000000);

    await factory.newPool(txAddr, tyAddr, 3000, 5000);
    poolAddr = await factory.pool(txAddr, tyAddr, 3000);

    // test mint
    const testMintFactory = await ethers.getContractFactory("TestMint");
    const testMint = await testMintFactory.deploy(factory.address);
    await testMint.deployed();
    getPoolAddr = await testMint.pool(txAddr, tyAddr, 3000);
    expect(getPoolAddr).to.equal(poolAddr);

    

    await addLiquidity(testMint, miner1, tokenX, tokenY, 3000, 4850, 5000, 10000);
    await addLiquidity(testMint, miner2, tokenX, tokenY, 3000, 5050, 5150, 20000);
    await addLiquidity(testMint, miner3, tokenX, tokenY, 3000, 4900, 5100, 30000);

    let rate = BigNumber('1.0001');

    [currPt, liquidity, liquidityX] = await printState(poolAddr);

    await tokenY.transfer(trader.address, 10000000000);
    x_5001 = l2x(BigNumber(30000), 5001, rate, false);

    amountY_5001 = BigNumber(12000);
    [acquireX, costY, liquidityXExpect] = y2xAtLiquidity(5001, rate, amountY_5001, liquidity, liquidity);
    costY_WithFee = ceil(costY.times(1000).div(997));
    
    const testSwapFactory = await ethers.getContractFactory("TestSwap");
    const testSwap = await testSwapFactory.deploy(factory.address);
    await testSwap.deployed();
    await tokenY.connect(trader).approve(testSwap.address, costY_WithFee.times(2).toFixed(0));
    await testSwap.connect(trader).swapY2X(
        tokenX.address, tokenY.address, 3000, costY_WithFee.toFixed(0), 5002);
    // for trader 2
    [currPt, liquidity, liquidityX] = await printState(poolAddr);
    expect(liquidityX.toFixed(0)).to.equal(liquidityXExpect.toFixed(0));

    costY_5001_Remain = l2y(liquidityX, 5001, rate, true);
    costY_5002_5050 = yInRange(BigNumber("30000"), 5002, 5050, rate, true);
    costY_5050_5100 = yInRange(BigNumber("50000"), 5050, 5100, rate, true);
    costY_5100_5125 = yInRange(BigNumber("20000"), 5100, 5125, rate, true);
    currX_5125_Origin = l2x(BigNumber("20000"), 5125, rate, false);

    currX_5125_part = BigNumber(currX_5125_Origin.times(3).div(13).toFixed(0));
    costY_5125_Remain = x2yAt(5125, rate, currX_5125_part);
    [currX_5125_part, costY_5125_Remain, liquidityXExpect] = y2xAtLiquidity(5125, rate, costY_5125_Remain, BigNumber("20000"), BigNumber("20000"));
    currX_5125_Remain = currX_5125_Origin.minus(currX_5125_part);
    costYRange = costY_5001_Remain.plus(
        costY_5002_5050).plus(
        costY_5050_5100).plus(
        costY_5100_5125).plus(
        costY_5125_Remain);
    costYRangeWithFee = amountAddFee(costY_5001_Remain).plus(
        amountAddFee(costY_5002_5050)).plus(
        amountAddFee(costY_5050_5100)).plus(
        amountAddFee(costY_5100_5125)).plus(
        amountAddFee(costY_5125_Remain));
    acquireX_5001_Remain = l2x(liquidityX, 5001, rate, false);
    acquireX_5002_5050 = xInRange(BigNumber("30000"), 5002, 5050, rate, false);
    acquireX_5050_5100 = xInRange(BigNumber("50000"), 5050, 5100, rate, false);
    acquireX_5100_5125 = xInRange(BigNumber("20000"), 5100, 5125, rate, false);
    acquireX_5125_Remain = currX_5125_part.plus("0");
    acquireXRange = acquireX_5001_Remain.plus(
        acquireX_5002_5050).plus(
        acquireX_5050_5100).plus(
        acquireX_5100_5125).plus(
        acquireX_5125_Remain);

    await tokenY.transfer(trader2.address, 10000000000);

    await tokenY.connect(trader2).approve(testSwap.address, costYRangeWithFee.times(2).toFixed(0));
    await testSwap.connect(trader2).swapY2X(
        tokenX.address, tokenY.address, 3000, costYRangeWithFee.toFixed(0), 5200);
    
    // expect acquireX should equal
    expect(acquireXRange.toFixed(0)).to.equal(blockNum2BigNumber(await tokenX.balanceOf(trader2.address)).toFixed(0));
    // expect costY should equal
    expect(
        costYRangeWithFee.plus(blockNum2BigNumber(await tokenY.balanceOf(trader2.address))).toFixed(0),
        "10000000000");

    [currPt, liquidity, liquidityX] = await printState(poolAddr);
    expect(currPt).to.equal(5125);
    expect(liquidity.toFixed(0)).to.equal("20000");
    expect(liquidityX.toFixed(0)).to.equal(liquidityXExpect.toFixed(0));
  });
});