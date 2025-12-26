// ============================
// CONFIGURATION
// ============================
const CONFIG = {
    ENIAC_TOKEN: "0xafF339de48848d0F8B5704909Ac94e8E8D7E3415",
    MASTERCHEF: "0x564DF71B75855d63c86a267206Cd0c9e35c92789",
    BSC_CHAIN_ID: 56,
    // BSC block times: ~3 seconds per block
    BLOCKS_PER_DAY: 28800,    // 24h * 60m * 60s / 3s
    BLOCKS_PER_YEAR: 10512000 // 365 * BLOCKS_PER_DAY
};

// ============================
// ABI UPDATED FOR ENIAC TOKEN (ANT is actually ENiAC)
// ============================
const ENIAC_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function decimals() view returns (uint8)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function totalSupply() view returns (uint256)",
    "function name() view returns (string)",
    "function symbol() view returns (string)",
    "function transfer(address to, uint256 amount) returns (bool)"
];

const MASTERCHEF_ABI = [
    // Core Functions
    "function poolInfo(uint256) view returns (address lpToken, uint256 allocPoint, uint256 lastRewardBlock, uint256 accANTPerShare)",
    "function userInfo(uint256, address) view returns (uint256 amount, uint256 rewardDebt)",
    "function pendingANT(uint256 _pid, address _user) view returns (uint256)",
    "function deposit(uint256 _pid, uint256 _amount)",
    "function withdraw(uint256 _pid, uint256 _amount)",
    "function emergencyWithdraw(uint256 _pid)",
    
    // Pool Information
    "function poolLength() view returns (uint256)",
    "function totalAllocPoint() view returns (uint256)",
    
    // Reward Information - NOTE: ANT here is actually ENiAC token
    "function ANTPerBlock() view returns (uint256)",
    "function startBlock() view returns (uint256)",
    "function getMultiplier(uint256 _from, uint256 _to) view returns (uint256)",
    
    // Token Information
    "function ANT() view returns (address)",
    
    // Admin Functions
    "function owner() view returns (address)",
    "function operator() view returns (address)",
    "function devaddr() view returns (address)",
    "function setANTPerBlock(uint256 _ANTPerBlock)"
];

// ============================
// GLOBAL VARIABLES
// ============================
let provider, signer, userAddress;
let eniacContract, masterchefContract;
let currentPoolId = null;
let tokenDecimals = 18;

// ============================
// APR CALCULATION FUNCTIONS
// ============================
async function calculateAPRFromContract() {
    try {
        if (!masterchefContract || currentPoolId === null) {
            console.log('Contract not initialized for APR calculation');
            return {
                apr: 0,
                apy: 0,
                dailyRewardRate: 0,
                poolRewardPerBlock: 0,
                totalStaked: 0,
                poolAllocPercentage: 0,
                blocksPerYear: CONFIG.BLOCKS_PER_YEAR
            };
        }

        console.log('📊 Calculating APR from MasterChef contract...');

        // 1. Get pool information
        const poolInfo = await masterchefContract.poolInfo(currentPoolId);
        const poolAllocPoint = parseFloat(poolInfo.allocPoint.toString());
        
        // 2. Get total allocation points
        const totalAllocPoint = await masterchefContract.totalAllocPoint();
        const totalAllocPointNum = parseFloat(totalAllocPoint.toString());
        
        // 3. Get ENiAC (ANT) per block emission rate
        const antPerBlock = await masterchefContract.ANTPerBlock();
        const antPerBlockNum = parseFloat(ethers.utils.formatUnits(antPerBlock, 18));
        
        // 4. Calculate pool's percentage of total allocation
        const poolAllocPercentage = (poolAllocPoint / totalAllocPointNum) * 100;
        
        // 5. Calculate pool's reward per block
        const poolRewardPerBlock = antPerBlockNum * (poolAllocPoint / totalAllocPointNum);
        
        // 6. Get total staked in the pool (LP token balance in MasterChef)
        let totalStaked = 0;
        try {
            const lpTokenContract = new ethers.Contract(
                poolInfo.lpToken,
                ['function balanceOf(address) view returns (uint256)'],
                provider
            );
            
            const totalStakedWei = await lpTokenContract.balanceOf(CONFIG.MASTERCHEF);
            totalStaked = parseFloat(ethers.utils.formatUnits(totalStakedWei, 18));
        } catch (error) {
            console.log('Could not get total staked:', error.message);
            // If it's the ENiAC token pool, try to get total supply
            if (poolInfo.lpToken.toLowerCase() === CONFIG.ENIAC_TOKEN.toLowerCase()) {
                const totalSupply = await eniacContract.totalSupply();
                totalStaked = parseFloat(ethers.utils.formatUnits(totalSupply, 18));
            }
        }
        
        // 7. Calculate APR (Annual Percentage Rate)
        let apr = 0;
        let apy = 0;
        let dailyRewardRate = 0;
        
        if (totalStaked > 0 && poolRewardPerBlock > 0) {
            // Annual rewards for this pool
            const annualRewards = poolRewardPerBlock * CONFIG.BLOCKS_PER_YEAR;
            
            // APR = (annual rewards / total staked) * 100
            apr = (annualRewards / totalStaked) * 100;
            
            // Daily reward rate (percentage of stake earned per day)
            dailyRewardRate = (poolRewardPerBlock * CONFIG.BLOCKS_PER_DAY / totalStaked) * 100;
            
            // Calculate APY (compounded daily)
            // APY = (1 + (APR/100)/365)^365 - 1
            const dailyRate = apr / 365 / 100;
            apy = (Math.pow(1 + dailyRate, 365) - 1) * 100;
            
            console.log('📈 APR/APY Calculation:', {
                poolAllocPoint: poolAllocPoint,
                totalAllocPoint: totalAllocPointNum,
                poolAllocPercentage: poolAllocPercentage.toFixed(2) + '%',
                antPerBlock: antPerBlockNum + ' ENiAC',
                poolRewardPerBlock: poolRewardPerBlock.toFixed(6) + ' ENiAC',
                totalStaked: totalStaked.toFixed(2) + ' ENiAC',
                annualRewards: annualRewards.toFixed(2) + ' ENiAC',
                apr: apr.toFixed(2) + '%',
                apy: apy.toFixed(2) + '%',
                dailyRewardRate: dailyRewardRate.toFixed(4) + '%'
            });
        } else {
            console.log('Cannot calculate APR: totalStaked or poolRewardPerBlock is zero');
        }
        
        // 8. Get additional pool statistics
        let currentBlock = 0;
        let startBlock = 0;
        try {
            currentBlock = await provider.getBlockNumber();
            startBlock = await masterchefContract.startBlock();
        } catch (error) {
            console.log('Could not get block information:', error.message);
        }
        
        return {
            apr: apr,
            apy: apy,
            dailyRewardRate: dailyRewardRate,
            poolRewardPerBlock: poolRewardPerBlock,
            totalStaked: totalStaked,
            poolAllocPoint: poolAllocPoint,
            totalAllocPoint: totalAllocPointNum,
            poolAllocPercentage: poolAllocPercentage,
            antPerBlock: antPerBlockNum,
            currentBlock: currentBlock,
            startBlock: startBlock,
            blocksPerYear: CONFIG.BLOCKS_PER_YEAR,
            blocksPerDay: CONFIG.BLOCKS_PER_DAY
        };
        
    } catch (error) {
        console.error('❌ Error calculating APR from contract:', error);
        return {
            apr: 0,
            apy: 0,
            dailyRewardRate: 0,
            poolRewardPerBlock: 0,
            totalStaked: 0,
            poolAllocPercentage: 0,
            blocksPerYear: CONFIG.BLOCKS_PER_YEAR
        };
    }
}

// ============================
// UPDATE APR DISPLAY
// ============================
async function updateAPRDisplay() {
    try {
        const aprData = await calculateAPRFromContract();
        
        // Update APR Value
        const aprValueElement = document.getElementById('aprValue');
        if (aprValueElement) {
            aprValueElement.textContent = aprData.apr.toFixed(2) + '%';
            
            // Color coding based on APR value
            if (aprData.apr > 50) {
                aprValueElement.style.color = '#10b981'; // Green for high APR
            } else if (aprData.apr > 20) {
                aprValueElement.style.color = '#f59e0b'; // Yellow for medium APR
            } else {
                aprValueElement.style.color = '#ef4444'; // Red for low APR
            }
        }
        
        // Update APY Value if element exists
        const apyValueElement = document.getElementById('apyValue');
        if (apyValueElement) {
            apyValueElement.textContent = aprData.apy.toFixed(2) + '%';
        }
        
        // Update Daily Reward Rate
        const dailyRewardsElement = document.getElementById('dailyRewardsAPR');
        if (dailyRewardsElement) {
            dailyRewardsElement.textContent = aprData.dailyRewardRate.toFixed(4) + '%';
        }
        
        // Update Pool Reward per Block
        const rewardPerBlockElement = document.getElementById('rewardPerBlock');
        if (rewardPerBlockElement) {
            rewardPerBlockElement.textContent = 
                aprData.poolRewardPerBlock.toFixed(6) + ' ENiAC';
        }
        
        // Update Total Staked
        const totalStakedElement = document.getElementById('totalStaked');
        if (totalStakedElement) {
            totalStakedElement.textContent = 
                aprData.totalStaked.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2
                }) + ' ENiAC';
        }
        
        // Update Pool Allocation Percentage
        const poolAllocElement = document.getElementById('poolAllocPercentage');
        if (poolAllocElement) {
            poolAllocElement.textContent = aprData.poolAllocPercentage.toFixed(2) + '%';
        }
        
        // Update ENiAC Per Block
        const antPerBlockElement = document.getElementById('antPerBlock');
        if (antPerBlockElement) {
            antPerBlockElement.textContent = aprData.antPerBlock.toFixed(6) + ' ENiAC';
        }
        
        // Update description based on APR value
        const aprDescription = document.getElementById('aprDescription');
        if (aprDescription) {
            if (aprData.apr === 0) {
                aprDescription.textContent = 'No staking data available';
                aprDescription.style.color = '#94a3b8';
            } else if (aprData.apr > 100) {
                aprDescription.textContent = '🚀 Very High Yield!';
                aprDescription.style.color = '#10b981';
            } else if (aprData.apr > 50) {
                aprDescription.textContent = '📈 High Yield Opportunity';
                aprDescription.style.color = '#10b981';
            } else if (aprData.apr > 20) {
                aprDescription.textContent = '👍 Good Returns';
                aprDescription.style.color = '#f59e0b';
            } else if (aprData.apr > 5) {
                aprDescription.textContent = '📊 Moderate Returns';
                aprDescription.style.color = '#f59e0b';
            } else {
                aprDescription.textContent = '📉 Low Returns';
                aprDescription.style.color = '#ef4444';
            }
        }
        
        // Calculate and display estimated daily/weekly/monthly rewards for user
        await updateUserRewardEstimates(aprData);
        
        return aprData;
        
    } catch (error) {
        console.error('Error updating APR display:', error);
    }
}

// ============================
// USER REWARD ESTIMATES
// ============================
async function updateUserRewardEstimates(aprData) {
    try {
        if (!currentViewAddress || !aprData || aprData.apr === 0) return;
        
        // Get user's staked amount
        const userInfo = await masterchefContract.userInfo(currentPoolId, currentViewAddress);
        const userStakedWei = userInfo.amount;
        const userStaked = parseFloat(ethers.utils.formatUnits(userStakedWei, 18));
        
        if (userStaked <= 0) return;
        
        // Calculate user's share of the pool
        const userShare = userStaked / aprData.totalStaked;
        
        // Calculate estimated rewards
        const dailyRewards = aprData.poolRewardPerBlock * CONFIG.BLOCKS_PER_DAY * userShare;
        const weeklyRewards = dailyRewards * 7;
        const monthlyRewards = dailyRewards * 30;
        const yearlyRewards = dailyRewards * 365;
        
        // Update UI elements if they exist
        const dailyEstimate = document.getElementById('dailyEstimate');
        const weeklyEstimate = document.getElementById('weeklyEstimate');
        const monthlyEstimate = document.getElementById('monthlyEstimate');
        const yearlyEstimate = document.getElementById('yearlyEstimate');
        
        if (dailyEstimate) {
            dailyEstimate.textContent = dailyRewards.toFixed(6) + ' ENiAC';
        }
        
        if (weeklyEstimate) {
            weeklyEstimate.textContent = weeklyRewards.toFixed(6) + ' ENiAC';
        }
        
        if (monthlyEstimate) {
            monthlyEstimate.textContent = monthlyRewards.toFixed(6) + ' ENiAC';
        }
        
        if (yearlyEstimate) {
            yearlyEstimate.textContent = yearlyRewards.toFixed(6) + ' ENiAC';
        }
        
        // Calculate percentage of stake earned per day
        const dailyPercentage = (dailyRewards / userStaked) * 100;
        const dailyPercentageElement = document.getElementById('dailyPercentage');
        if (dailyPercentageElement) {
            dailyPercentageElement.textContent = dailyPercentage.toFixed(4) + '%';
        }
        
    } catch (error) {
        console.error('Error calculating user reward estimates:', error);
    }
}

// ============================
// HTML UPDATES FOR APR DISPLAY
// ============================
// Thêm vào cuối file HTML trước khi đóng </body>
document.addEventListener('DOMContentLoaded', function() {
    // Thêm section chi tiết APR vào DOM nếu chưa có
    const mainContent = document.querySelector('.main-content');
    
    if (mainContent && !document.getElementById('aprDetailsSection')) {
        const aprDetailsHTML = `
            <div class="card" id="aprDetailsSection">
                <h2><i class="fas fa-calculator"></i> APR/APY Details</h2>
                
                <div class="stats-row" style="margin-bottom: 20px;">
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-chart-line"></i>
                        </div>
                        <div class="stat-content">
                            <h3>APR (Annual)</h3>
                            <div class="stat-value" id="aprValue">0%</div>
                            <div class="stat-label" id="aprDescription">Calculating...</div>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-rocket"></i>
                        </div>
                        <div class="stat-content">
                            <h3>APY (Compounded)</h3>
                            <div class="stat-value" id="apyValue">0%</div>
                            <div class="stat-label">With Daily Compounding</div>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-calendar-day"></i>
                        </div>
                        <div class="stat-content">
                            <h3>Daily Rate</h3>
                            <div class="stat-value" id="dailyRewardsAPR">0%</div>
                            <div class="stat-label">Per Day</div>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <div class="stat-icon">
                            <i class="fas fa-cube"></i>
                        </div>
                        <div class="stat-content">
                            <h3>Reward/Block</h3>
                            <div class="stat-value" id="rewardPerBlock">0 ENiAC</div>
                            <div class="stat-label">Per Block</div>
                        </div>
                    </div>
                </div>
                
                <div class="details-grid">
                    <div class="detail-item">
                        <div class="detail-label">Total Staked in Pool</div>
                        <div class="detail-value" id="totalStaked">0 ENiAC</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Pool Allocation</div>
                        <div class="detail-value" id="poolAllocPercentage">0%</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">ENiAC Per Block</div>
                        <div class="detail-value" id="antPerBlock">0 ENiAC</div>
                    </div>
                    <div class="detail-item">
                        <div class="detail-label">Blocks Per Year</div>
                        <div class="detail-value">${CONFIG.BLOCKS_PER_YEAR.toLocaleString()}</div>
                    </div>
                </div>
                
                <div style="margin-top: 25px; padding: 20px; background: #0f172a; border-radius: 10px;">
                    <h3 style="margin-bottom: 15px; color: #60a5fa;">
                        <i class="fas fa-coins"></i> Your Estimated Rewards
                    </h3>
                    <div class="details-grid">
                        <div class="detail-item">
                            <div class="detail-label">Daily Estimate</div>
                            <div class="detail-value" id="dailyEstimate">0 ENiAC</div>
                            <div class="detail-label" style="font-size: 0.8rem;" id="dailyPercentage">0% of stake</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Weekly Estimate</div>
                            <div class="detail-value" id="weeklyEstimate">0 ENiAC</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Monthly Estimate</div>
                            <div class="detail-value" id="monthlyEstimate">0 ENiAC</div>
                        </div>
                        <div class="detail-item">
                            <div class="detail-label">Yearly Estimate</div>
                            <div class="detail-value" id="yearlyEstimate">0 ENiAC</div>
                        </div>
                    </div>
                </div>
                
                <div class="network-info" style="margin-top: 20px;">
                    <i class="fas fa-info-circle"></i>
                    <p>
                        <strong>APR Formula:</strong> (Pool Reward Per Block × Blocks Per Year ÷ Total Staked) × 100<br>
                        <strong>APY Formula:</strong> (1 + APR/36500)³⁶⁵ - 1 × 100 (compounded daily)<br>
                        <strong>Note:</strong> APR/APY may change based on pool allocation and total staked amount.
                    </p>
                </div>
            </div>
        `;
        
        // Insert before the contract info card
        const contractCard = document.querySelector('.card:last-child');
        if (contractCard) {
            contractCard.insertAdjacentHTML('beforebegin', aprDetailsHTML);
        } else {
            mainContent.insertAdjacentHTML('beforeend', aprDetailsHTML);
        }
    }
});

// ============================
// UPDATE LOAD DATA FUNCTION
// ============================
async function loadData() {
    if (!currentViewAddress || currentPoolId === null) return;
    
    try {
        // 1. Load wallet balance
        const balance = await eniacContract.balanceOf(currentViewAddress);
        const balanceFormatted = ethers.utils.formatUnits(balance, 18);
        document.getElementById('walletBalance').textContent = 
            parseFloat(balanceFormatted).toFixed(4) + ' ENiAC';
        document.getElementById('availableBalance').textContent = 
            parseFloat(balanceFormatted).toFixed(4);
        
        // 2. Load allowance (only for user's own wallet)
        if (!isViewingOtherWallet && userAddress === currentViewAddress) {
            const allowance = await eniacContract.allowance(currentViewAddress, CONFIG.MASTERCHEF);
            const allowanceFormatted = ethers.utils.formatUnits(allowance, 18);
            document.getElementById('allowanceAmount').textContent = 
                parseFloat(allowanceFormatted).toFixed(4) + ' ENiAC';
            
            // Update approve button
            const approveBtn = document.getElementById('approveBtn');
            if (parseFloat(allowanceFormatted) > 0) {
                approveBtn.innerHTML = '<i class="fas fa-check"></i> Approved';
                approveBtn.disabled = true;
                approveBtn.style.background = '#059669';
                document.getElementById('stakeBtn').disabled = false;
            } else {
                approveBtn.innerHTML = '<i class="fas fa-check-circle"></i> Approve';
                approveBtn.disabled = false;
                approveBtn.style.background = '#10b981';
                document.getElementById('stakeBtn').disabled = true;
            }
        } else {
            document.getElementById('allowanceAmount').textContent = 'View Only';
        }
        
        // 3. Load staking data
        await loadStakingData();
        
        // 4. Calculate and display APR/APY from contract
        await updateAPRDisplay();
        
    } catch (error) {
        console.error('Load data error:', error);
    }
}

// ============================
// AUTO REFRESH APR
// ============================
function startAutoRefresh() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
    
    refreshInterval = setInterval(async () => {
        if (isConnected && currentViewAddress) {
            await loadData();
        }
    }, 30000); // Refresh every 30 seconds
}

// ============================
// INITIALIZE WITH APR CALCULATION
// ============================
async function setupApp() {
    try {
        // Update UI
        updateViewingModeUI();
        
        // Setup provider and contracts
        provider = new ethers.providers.Web3Provider(window.ethereum);
        signer = provider.getSigner();
        
        eniacContract = new ethers.Contract(CONFIG.ENIAC_TOKEN, ENIAC_ABI, signer);
        masterchefContract = new ethers.Contract(CONFIG.MASTERCHEF, MASTERCHEF_ABI, signer);
        
        // Find the correct pool ID
        await findCorrectPool();
        
        // Verify token addresses match
        await verifyTokenAddresses();
        
        // Load initial data including APR
        await loadData();
        
        // Setup auto-refresh
        startAutoRefresh();
        
    } catch (error) {
        console.error('Setup error:', error);
        showMessage('Setup error: ' + error.message, 'error');
    }
}

// ============================
// VERIFY TOKEN ADDRESSES
// ============================
async function verifyTokenAddresses() {
    try {
        // Get ANT address from MasterChef (should be ENiAC token)
        const antAddress = await masterchefContract.ANT();
        console.log('Token from MasterChef.ANT():', antAddress);
        console.log('ENiAC Token Address:', CONFIG.ENIAC_TOKEN);
        
        if (antAddress.toLowerCase() !== CONFIG.ENIAC_TOKEN.toLowerCase()) {
            console.warn('⚠️ WARNING: MasterChef ANT token does not match ENiAC token address!');
            console.warn('MasterChef ANT:', antAddress);
            console.warn('ENiAC Token:', CONFIG.ENIAC_TOKEN);
        } else {
            console.log('✅ Verified: MasterChef ANT token is ENiAC token');
        }
    } catch (error) {
        console.log('Could not verify token addresses:', error.message);
    }
}