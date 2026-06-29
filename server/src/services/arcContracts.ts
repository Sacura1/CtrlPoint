import solc from 'solc'
import { createPublicClient, createWalletClient, defineChain, http, toFunctionSelector } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { cfg } from '../config'
import { AppError } from '../middleware/errorHandler'

export type ArcContractTemplate = 'payment-links' | 'split-payments' | 'voting-polls' | 'membership' | 'games'

type CompiledContract = {
  abi: any[]
  bytecode: `0x${string}`
  sourceCode: string
  contractName: string
}

const compiledTemplateCache = new Map<ArcContractTemplate, CompiledContract>()

export type ArcGeneratedContract = {
  sourceCode: string
  contractName: string
}

export function injectArcContractConfig(html: string, contract: {
  contractAddress?: string | null
  abiJson?: string | null
  explorerUrl?: string | null
  contractName?: string | null
  ownerAddress?: string | null
}) {
  const abi = contract.abiJson ? JSON.parse(contract.abiJson) : []
  const selectors = Object.fromEntries(
    abi
      .filter((item: any) => item.type === 'function')
      .map((item: any) => {
        const signature = `${item.name}(${(item.inputs || []).map((input: any) => input.type).join(',')})`
        return [signature, toFunctionSelector(signature)]
      })
  )
  const config = JSON.stringify({
    address: contract.contractAddress || null,
    abi,
    selectors,
    explorerUrl: contract.explorerUrl || null,
    contractName: contract.contractName || null,
    ownerAddress: contract.ownerAddress || null,
  })
  const script = `<script id="ctrlpoint-arc-contract-config">
window.CTRLPOINT_ARC_CONTRACT=${config};
(function(){
  var cfg=window.CTRLPOINT_ARC_CONTRACT;
  var rpcUrl='https://rpc.testnet.arc.network';
  function provider(){try{return window.ethereum||(window.parent&&window.parent!==window&&window.parent.ethereum)||null}catch(_){return window.ethereum||null}}
  function pageUrl(params){
    var explicit=window.CTRLPOINT_PUBLIC_URL;
    var base=explicit||(location.protocol==='http:'||location.protocol==='https:'?location.origin+location.pathname:null);
    if(!base)return null;
    var url=new URL(base);
    Object.keys(params||{}).forEach(function(key){var value=params[key];if(value!==undefined&&value!==null&&String(value)!=='')url.searchParams.set(key,String(value))});
    return url.toString();
  }
  async function rpc(method,params){
    var response=await fetch(rpcUrl,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:Date.now(),method:method,params:params||[]})});
    var payload=await response.json();
    if(payload.error)throw new Error(payload.error.message||'Arc RPC request failed');
    return payload.result;
  }
  async function waitForReceipt(hash,timeoutMs){
    var deadline=Date.now()+(timeoutMs||120000);
    while(Date.now()<deadline){
      var receipt=await rpc('eth_getTransactionReceipt',[hash]);
      if(receipt)return receipt;
      await new Promise(function(resolve){setTimeout(resolve,1800)});
    }
    throw new Error('Transaction confirmation is taking longer than expected.');
  }
  async function requestId(value){
    var bytes=new TextEncoder().encode(String(value||''));
    var digest=await crypto.subtle.digest('SHA-256',bytes);
    return '0x'+Array.from(new Uint8Array(digest)).map(function(byte){return byte.toString(16).padStart(2,'0')}).join('');
  }
  function textToBytes32(value){
    var bytes=new TextEncoder().encode(String(value||'').trim());
    if(!bytes.length)throw new Error('Enter a label.');
    if(bytes.length>31)throw new Error('Labels must be 31 bytes or shorter.');
    return '0x'+Array.from(bytes).map(function(byte){return byte.toString(16).padStart(2,'0')}).join('').padEnd(64,'0');
  }
  function bytes32ToText(value){
    var raw=String(value||'').replace(/^0x/,'').slice(0,64).replace(/(00)+$/,'');
    if(!raw)return '';
    var bytes=[];
    for(var i=0;i<raw.length;i+=2)bytes.push(parseInt(raw.slice(i,i+2),16));
    return new TextDecoder().decode(new Uint8Array(bytes));
  }
  function toNativeUnits(value){
    var text=String(value||'0').trim();
    if(!/^\\d+(\\.\\d{0,18})?$/.test(text))throw new Error('Enter a valid USDC amount.');
    var parts=text.split('.');
    return BigInt(parts[0]||'0')*1000000000000000000n+BigInt((parts[1]||'').padEnd(18,'0'));
  }
  function formatNativeUnits(value){
    var amount=BigInt(value||0);
    var whole=amount/1000000000000000000n;
    var fraction=(amount%1000000000000000000n).toString().padStart(18,'0').replace(/0+$/,'');
    return fraction?whole.toString()+'.'+fraction:whole.toString();
  }
  function pad(value){return value.replace(/^0x/,'').padStart(64,'0')}
  function decodedBigInt(hex){
    var value=String(hex||'').trim();
    if(!value||value==='0x')return 0n;
    return BigInt(value);
  }
  function encode(type,value){
    if(type==='address')return pad(String(value).toLowerCase());
    if(type==='bool')return pad(value?'1':'0');
    if(/^u?int(\\d+)?$/.test(type))return pad(BigInt(value).toString(16));
    if(type==='bytes32'){var raw=String(value).replace(/^0x/,'');if(!/^[a-fA-F0-9]{64}$/.test(raw))throw new Error('bytes32 values must be 32-byte hex.');return raw}
    throw new Error('Unsupported generated contract argument: '+type);
  }
  function item(name,args){var matches=cfg.abi.filter(function(x){return x.type==='function'&&x.name===name&&(x.inputs||[]).length===(args||[]).length});if(matches.length!==1)throw new Error('Contract function is unavailable or overloaded: '+name);return matches[0]}
  function data(name,args){args=args||[];var fn=item(name,args);var sig=fn.name+'('+(fn.inputs||[]).map(function(x){return x.type}).join(',')+')';return cfg.selectors[sig]+(fn.inputs||[]).map(function(input,i){return encode(input.type,args[i])}).join('')}
  async function switchChain(){var p=provider();if(!p)throw new Error('Open this dApp in a browser with an EVM wallet.');try{await p.request({method:'wallet_switchEthereumChain',params:[{chainId:'0x4cef52'}]})}catch(err){if(err&&err.code!==4902)throw err;await p.request({method:'wallet_addEthereumChain',params:[{chainId:'0x4cef52',chainName:'Arc Testnet',nativeCurrency:{name:'USDC',symbol:'USDC',decimals:18},rpcUrls:['https://rpc.testnet.arc.network'],blockExplorerUrls:['https://testnet.arcscan.app']}]})}return p}
  window.CTRLPOINT_ARC_PAGE={
    isPreview:!!window.CTRLPOINT_IS_PREVIEW||location.protocol==='about:',
    publicUrl:function(){return pageUrl()},
    shareUrl:pageUrl,
    rpc:rpc,
    waitForReceipt:waitForReceipt,
    requestId:requestId,
    textToBytes32:textToBytes32,
    bytes32ToText:bytes32ToText,
    toNativeUnits:toNativeUnits,
    formatNativeUnits:formatNativeUnits,
    toHex:function(value){return '0x'+BigInt(value).toString(16)}
  };
  window.CTRLPOINT_ARC_RUNTIME={
    connect:async function(){var p=await switchChain();var accounts=await p.request({method:'eth_requestAccounts'});return accounts&&accounts[0]},
    switchChain:switchChain,
    read:async function(name,args){if(!cfg.address)throw new Error('This contract is deployed during publishing.');var p=provider();var payload={to:cfg.address,data:data(name,args||[])};return p?p.request({method:'eth_call',params:[payload,'latest']}):rpc('eth_call',[payload,'latest'])},
    write:async function(name,args,options){if(!cfg.address)throw new Error('This contract is deployed during publishing.');var p=await switchChain();var accounts=await p.request({method:'eth_requestAccounts'});var tx={from:accounts[0],to:cfg.address,data:data(name,args||[])};if(options&&options.value)tx.value=options.value;return p.request({method:'eth_sendTransaction',params:[tx]})},
    decodeUint:decodedBigInt,
    decodeBool:function(hex){return decodedBigInt(hex)!==0n},
    decodeAddress:function(hex){var raw=String(hex||'').replace(/^0x/,'');return raw.length>=40?'0x'+raw.slice(-40):null}
  };
})();
</script>`
  let stripped = html.replace(/<script id="ctrlpoint-arc-contract-config">[\s\S]*?<\/script>\s*/i, '')
  if (!/<meta[^>]+name=["']viewport["']/i.test(stripped)) {
    stripped = /<head>/i.test(stripped)
      ? stripped.replace(/<head>/i, '<head>\n<meta name="viewport" content="width=device-width, initial-scale=1.0">')
      : stripped
  }
  return /<\/head>/i.test(stripped)
    ? stripped.replace(/<\/head>/i, `${script}\n</head>`)
    : `${script}\n${stripped}`
}

const CONTRACTS: Record<ArcContractTemplate, { name: string; source: string; args: (owner: string) => any[] }> = {
  'payment-links': {
    name: 'CtrlPointPaymentRequests',
    args: owner => [owner],
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract CtrlPointPaymentRequests {
    address public owner;

    struct Receipt {
        address payer;
        address recipient;
        uint256 amount;
        uint256 paidAt;
    }

    mapping(bytes32 => Receipt) private receipts;

    event PaymentReceived(
        bytes32 indexed requestId,
        address indexed payer,
        address indexed recipient,
        uint256 amount
    );

    constructor(address owner_) {
        require(owner_ != address(0), "owner required");
        owner = owner_;
    }

    function pay(bytes32 requestId, address payable recipient, uint256 expectedAmount) external payable {
        require(requestId != bytes32(0), "request required");
        require(recipient != address(0), "recipient required");
        require(expectedAmount > 0 && msg.value == expectedAmount, "wrong amount");
        require(receipts[requestId].paidAt == 0, "already paid");

        receipts[requestId] = Receipt(msg.sender, recipient, msg.value, block.timestamp);
        (bool ok,) = recipient.call{value: msg.value}("");
        require(ok, "payment failed");

        emit PaymentReceived(requestId, msg.sender, recipient, msg.value);
    }

    function isPaid(bytes32 requestId) external view returns (bool) {
        return receipts[requestId].paidAt != 0;
    }

    function paymentPayer(bytes32 requestId) external view returns (address) {
        return receipts[requestId].payer;
    }

    function paymentRecipient(bytes32 requestId) external view returns (address) {
        return receipts[requestId].recipient;
    }

    function paymentAmount(bytes32 requestId) external view returns (uint256) {
        return receipts[requestId].amount;
    }

    function paymentPaidAt(bytes32 requestId) external view returns (uint256) {
        return receipts[requestId].paidAt;
    }
}`,
  },
  'split-payments': {
    name: 'CtrlPointSplitPayments',
    args: owner => [owner],
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract CtrlPointSplitPayments {
    address public owner;
    address[] public recipients;
    uint16[] public sharesBps;
    uint256 public totalSharesBps;
    uint256 public totalPaid;
    bool public configured;
    bool private locked;
    event ConfigurationStarted();
    event RecipientAdded(address indexed recipient, uint16 shareBps);
    event SplitConfigured(uint256 recipientCount);
    event PaymentSplit(address indexed payer, uint256 amount);
    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }
    modifier nonReentrant() { require(!locked, "reentrant"); locked = true; _; locked = false; }
    constructor(address owner_) { require(owner_ != address(0), "owner required"); owner = owner_; }
    function beginConfiguration() external onlyOwner {
        delete recipients;
        delete sharesBps;
        totalSharesBps = 0;
        configured = false;
        emit ConfigurationStarted();
    }
    function addRecipient(address recipient, uint16 shareBps) external onlyOwner {
        require(!configured, "configuration locked");
        require(recipient != address(0), "bad recipient");
        require(shareBps > 0, "share required");
        require(recipients.length < 20, "too many recipients");
        require(totalSharesBps + shareBps <= 10000, "shares exceed 100%");
        for (uint256 i = 0; i < recipients.length; i++) {
            require(recipients[i] != recipient, "duplicate recipient");
        }
        recipients.push(recipient);
        sharesBps.push(shareBps);
        totalSharesBps += shareBps;
        emit RecipientAdded(recipient, shareBps);
    }
    function finalizeConfiguration() external onlyOwner {
        require(recipients.length >= 2, "two recipients required");
        require(totalSharesBps == 10000, "shares must equal 100%");
        configured = true;
        emit SplitConfigured(recipients.length);
    }
    function recipientCount() external view returns (uint256) { return recipients.length; }
    function pay() external payable nonReentrant {
        require(msg.value > 0, "no value");
        require(configured, "not configured");
        totalPaid += msg.value;
        uint256 remaining = msg.value;
        for (uint256 i = 0; i < recipients.length; i++) {
            uint256 amount = i == recipients.length - 1 ? remaining : (msg.value * sharesBps[i]) / 10000;
            remaining -= amount;
            (bool ok,) = payable(recipients[i]).call{value: amount}("");
            require(ok, "transfer failed");
        }
        emit PaymentSplit(msg.sender, msg.value);
    }
}`,
  },
  'voting-polls': {
    name: 'CtrlPointPoll',
    args: owner => [owner],
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract CtrlPointPoll {
    address public owner;
    bytes32[] public options;
    mapping(address => bool) public hasVoted;
    mapping(uint256 => uint256) public votes;
    bool public pollOpen;
    bool public pollClosed;
    event OptionAdded(uint256 indexed optionId, bytes32 label);
    event PollOpened(uint256 optionCount);
    event PollClosed();
    event Voted(address indexed voter, uint256 indexed optionId);
    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }
    constructor(address owner_) { require(owner_ != address(0), "owner required"); owner = owner_; }
    function addOption(bytes32 label) external onlyOwner {
        require(!pollOpen && !pollClosed, "options locked");
        require(label != bytes32(0), "label required");
        require(options.length < 12, "too many options");
        for (uint256 i = 0; i < options.length; i++) {
            require(options[i] != label, "duplicate option");
        }
        options.push(label);
        emit OptionAdded(options.length - 1, label);
    }
    function openPoll() external onlyOwner {
        require(!pollOpen && !pollClosed, "poll unavailable");
        require(options.length >= 2, "two options required");
        pollOpen = true;
        emit PollOpened(options.length);
    }
    function closePoll() external onlyOwner {
        require(pollOpen, "poll not open");
        pollOpen = false;
        pollClosed = true;
        emit PollClosed();
    }
    function vote(uint256 optionId) external {
        require(pollOpen && !pollClosed, "poll not open");
        require(optionId < options.length, "bad option");
        require(!hasVoted[msg.sender], "already voted");
        hasVoted[msg.sender] = true;
        votes[optionId] += 1;
        emit Voted(msg.sender, optionId);
    }
    function optionCount() external view returns (uint256) { return options.length; }
}`,
  },
  membership: {
    name: 'CtrlPointMembership',
    args: owner => [owner],
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract CtrlPointMembership {
    address public owner;
    uint256 public price;
    uint256 public durationSeconds;
    uint256 public totalMembers;
    mapping(address => uint256) public memberUntil;
    bool private locked;
    event PlanUpdated(uint256 price, uint256 durationSeconds);
    event Joined(address indexed member, uint256 until);
    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }
    modifier nonReentrant() { require(!locked, "reentrant"); locked = true; _; locked = false; }
    constructor(address owner_) { require(owner_ != address(0), "owner required"); owner = owner_; durationSeconds = 30 days; }
    function setPlan(uint256 price_, uint256 durationSeconds_) external onlyOwner {
        require(price_ > 0, "price required");
        require(durationSeconds_ > 0, "duration required");
        price = price_;
        durationSeconds = durationSeconds_;
        emit PlanUpdated(price_, durationSeconds_);
    }
    function join() external payable {
        require(price > 0, "plan not configured");
        require(msg.value == price, "wrong amount");
        uint256 start = block.timestamp > memberUntil[msg.sender] ? block.timestamp : memberUntil[msg.sender];
        if (memberUntil[msg.sender] < block.timestamp) totalMembers += 1;
        memberUntil[msg.sender] = start + durationSeconds;
        emit Joined(msg.sender, memberUntil[msg.sender]);
    }
    function active(address member) external view returns (bool) { return memberUntil[member] >= block.timestamp; }
    function withdraw(address payable to) external onlyOwner nonReentrant {
        require(to != address(0), "bad recipient");
        (bool ok,) = to.call{value: address(this).balance}("");
        require(ok, "withdraw failed");
    }
}`,
  },
  games: {
    name: 'CtrlPointGameLeaderboard',
    args: owner => [owner],
    source: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

contract CtrlPointGameLeaderboard {
    address public owner;
    uint256 public entryFee;
    uint256 public roundId = 1;
    mapping(uint256 => mapping(address => uint256)) public bestScore;
    mapping(uint256 => mapping(address => bool)) public entered;
    mapping(uint256 => address[]) private roundPlayers;
    mapping(uint256 => mapping(address => bool)) private playerAdded;
    bool private locked;
    event EntryFeeUpdated(uint256 entryFee);
    event Entered(address indexed player, uint256 indexed roundId, uint256 amount);
    event ScoreSubmitted(address indexed player, uint256 indexed roundId, uint256 score);
    event RoundReset(uint256 indexed roundId);
    modifier onlyOwner() { require(msg.sender == owner, "not owner"); _; }
    modifier nonReentrant() { require(!locked, "reentrant"); locked = true; _; locked = false; }
    constructor(address owner_) { require(owner_ != address(0), "owner required"); owner = owner_; }
    function setEntryFee(uint256 entryFee_) external onlyOwner {
        entryFee = entryFee_;
        emit EntryFeeUpdated(entryFee_);
    }
    function enter() external payable {
        require(!entered[roundId][msg.sender], "already entered");
        require(msg.value == entryFee, "wrong entry amount");
        entered[roundId][msg.sender] = true;
        emit Entered(msg.sender, roundId, msg.value);
    }
    function submitScore(uint256 score) external {
        require(score > 0, "score required");
        require(entered[roundId][msg.sender], "enter round first");
        require(score > bestScore[roundId][msg.sender], "not best");
        if (!playerAdded[roundId][msg.sender]) {
            playerAdded[roundId][msg.sender] = true;
            roundPlayers[roundId].push(msg.sender);
        }
        bestScore[roundId][msg.sender] = score;
        emit ScoreSubmitted(msg.sender, roundId, score);
    }
    function playerCount(uint256 round) external view returns (uint256) { return roundPlayers[round].length; }
    function playerAt(uint256 round, uint256 index) external view returns (address) { return roundPlayers[round][index]; }
    function resetRound() external onlyOwner {
        roundId += 1;
        emit RoundReset(roundId);
    }
    function withdraw(address payable to) external onlyOwner nonReentrant {
        require(to != address(0), "bad recipient");
        (bool ok,) = to.call{value: address(this).balance}("");
        require(ok, "withdraw failed");
    }
}`,
  },
}

export const ARC_CONTRACT_TEMPLATES = Object.keys(CONTRACTS) as ArcContractTemplate[]

export function preparedArcContractForCategory(category: string) {
  if (!isArcContractTemplate(category)) return null
  const compiled = compileTemplate(category)
  const summaries: Record<ArcContractTemplate, string> = {
    'payment-links': 'Records each payment request on Arc so paid status and receipt details are verified automatically.',
    'split-payments': 'Stores a bounded recipient split and distributes each incoming payment using the finalized percentages.',
    'voting-polls': 'Stores poll options, enforces one vote per wallet, and exposes live onchain results.',
    membership: 'Stores a paid membership plan and verifies each wallet’s active access period onchain.',
    games: 'Collects optional USDC round entries and stores wallet-linked community leaderboard scores without automatic score-based prize payouts.',
  }
  return {
    abi: compiled.abi,
    sourceCode: compiled.sourceCode,
    contractName: compiled.contractName,
    summary: summaries[category],
  }
}

export function isArcContractTemplate(value: unknown): value is ArcContractTemplate {
  return typeof value === 'string' && ARC_CONTRACT_TEMPLATES.includes(value as ArcContractTemplate)
}

export function contractTemplateForCategory(category: string): ArcContractTemplate | null {
  return isArcContractTemplate(category) ? category : null
}

function normalizePrivateKey(value: string): `0x${string}` {
  const key = value.trim()
  if (!key) throw new AppError(409, 'ARC_DEPLOYER_PRIVATE_KEY is not configured.')
  return (key.startsWith('0x') ? key : `0x${key}`) as `0x${string}`
}

function compileTemplate(template: ArcContractTemplate): CompiledContract {
  const cached = compiledTemplateCache.get(template)
  if (cached) return cached
  const contract = CONTRACTS[template]
  const input = {
    language: 'Solidity',
    sources: { [`${contract.name}.sol`]: { content: contract.source } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
    },
  }
  const output = JSON.parse(solc.compile(JSON.stringify(input)))
  const errors = (output.errors || []).filter((err: any) => err.severity === 'error')
  if (errors.length > 0) throw new AppError(500, `Contract compile failed: ${errors[0].formattedMessage || errors[0].message}`)
  const compiled = output.contracts?.[`${contract.name}.sol`]?.[contract.name]
  if (!compiled?.abi || !compiled?.evm?.bytecode?.object) throw new AppError(500, 'Contract compile output was incomplete.')
  const result: CompiledContract = {
    abi: compiled.abi,
    bytecode: `0x${compiled.evm.bytecode.object}`,
    sourceCode: contract.source,
    contractName: contract.name,
  }
  compiledTemplateCache.set(template, result)
  return result
}

function validateGeneratedSource(sourceCode: string, contractName: string) {
  if (!sourceCode.trim()) throw new AppError(400, 'Generated contract source is empty.')
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(contractName)) throw new AppError(400, 'Generated contract name is invalid.')
  if (/^\s*import\s/m.test(sourceCode)) throw new AppError(400, 'Generated contracts cannot use external imports.')
  const blocked = [
    { pattern: /\bselfdestruct\s*\(/i, label: 'selfdestruct' },
    { pattern: /\.delegatecall\s*\(/i, label: 'delegatecall' },
    { pattern: /\btx\.origin\b/i, label: 'tx.origin' },
    { pattern: /\bassembly\s*\{/i, label: 'inline assembly' },
    { pattern: /\bcreate2?\s*\(/i, label: 'dynamic contract creation' },
    { pattern: /\.(?:transfer|send)\s*\(/i, label: 'legacy native transfer method' },
  ]
  const unsafe = blocked.find(item => item.pattern.test(sourceCode))
  if (unsafe) throw new AppError(400, `Generated contract uses unsupported ${unsafe.label}.`)
  if (!new RegExp(`\\bcontract\\s+${contractName}\\b`).test(sourceCode)) {
    throw new AppError(400, `Generated source does not contain contract ${contractName}.`)
  }
  if (sourceCode.length > 40_000) throw new AppError(400, 'Generated contract is too large for the custom dApp safety profile.')
  if (/\.call\s*\{\s*value\s*:/i.test(sourceCode)
    && !/\bnonReentrant\b/.test(sourceCode)) {
    throw new AppError(400, 'Generated contracts that transfer native USDC must use a nonReentrant guard.')
  }
  if (/(?:blockhash\s*\(|block\.prevrandao|block\.timestamp)[\s\S]{0,300}(?:winner|prize|random)/i.test(sourceCode)) {
    throw new AppError(400, 'Generated contracts cannot use block values as financial randomness.')
  }
}

export function compileGeneratedArcContract(sourceCode: string, contractName: string): CompiledContract {
  validateGeneratedSource(sourceCode, contractName)
  const filename = `${contractName}.sol`
  const input = {
    language: 'Solidity',
    sources: { [filename]: { content: sourceCode } },
    settings: {
      optimizer: { enabled: true, runs: 200 },
      outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } },
    },
  }
  const output = JSON.parse(solc.compile(JSON.stringify(input)))
  const errors = (output.errors || []).filter((err: any) => err.severity === 'error')
  if (errors.length > 0) {
    throw new AppError(400, `Contract compile failed: ${errors[0].formattedMessage || errors[0].message}`)
  }
  const compiled = output.contracts?.[filename]?.[contractName]
  if (!compiled?.abi || !compiled?.evm?.bytecode?.object) {
    throw new AppError(500, 'Generated contract compile output was incomplete.')
  }
  const constructor = compiled.abi.find((item: any) => item.type === 'constructor')
  const inputs = constructor?.inputs || []
  if (inputs.length !== 1 || inputs[0]?.type !== 'address') {
    throw new AppError(400, 'Generated contracts must accept exactly one owner address in the constructor.')
  }
  const ownerGetter = compiled.abi.find((item: any) =>
    item.type === 'function'
    && item.name === 'owner'
    && (item.inputs || []).length === 0
    && item.outputs?.[0]?.type === 'address'
  )
  if (!ownerGetter) throw new AppError(400, 'Generated contracts must expose a public owner address.')
  return {
    abi: compiled.abi,
    bytecode: `0x${compiled.evm.bytecode.object}`,
    sourceCode,
    contractName,
  }
}

export function compileArcContractTemplate(template: ArcContractTemplate) {
  const compiled = compileTemplate(template)
  return {
    template,
    contractName: compiled.contractName,
    abiItems: compiled.abi.length,
    bytecodeBytes: Math.floor((compiled.bytecode.length - 2) / 2),
  }
}

export async function deployArcContract(template: ArcContractTemplate, ownerAddress: string) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(ownerAddress)) throw new AppError(400, 'Enter a valid EVM owner wallet address.')
  const compiled = compileTemplate(template)
  const account = privateKeyToAccount(normalizePrivateKey(cfg.arc.deployerPrivateKey))
  const chain = defineChain({
    id: cfg.arc.chainId,
    name: 'Arc Testnet',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpcUrls: { default: { http: [cfg.arc.rpcUrl] } },
    blockExplorers: { default: { name: 'ArcScan', url: cfg.arc.explorerUrl } },
  })
  const transport = http(cfg.arc.rpcUrl)
  const wallet = createWalletClient({ account, chain, transport })
  const publicClient = createPublicClient({ chain, transport })
  const hash = await wallet.deployContract({
    abi: compiled.abi,
    bytecode: compiled.bytecode,
    args: CONTRACTS[template].args(ownerAddress),
  })
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (!receipt.contractAddress) throw new AppError(500, 'Arc contract deployed but no contract address was returned.')
  return {
    contractAddress: receipt.contractAddress,
    deployTxHash: hash,
    explorerUrl: `${cfg.arc.explorerUrl}/address/${receipt.contractAddress}`,
    abi: compiled.abi,
    sourceCode: compiled.sourceCode,
    contractName: compiled.contractName,
  }
}

export async function deployGeneratedArcContract(
  sourceCode: string,
  contractName: string,
  ownerAddress: string,
  onSubmitted?: (hash: `0x${string}`) => Promise<void> | void,
) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(ownerAddress)) throw new AppError(400, 'Enter a valid EVM owner wallet address.')
  const compiled = compileGeneratedArcContract(sourceCode, contractName)
  const account = privateKeyToAccount(normalizePrivateKey(cfg.arc.deployerPrivateKey))
  const chain = defineChain({
    id: cfg.arc.chainId,
    name: 'Arc Testnet',
    nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
    rpcUrls: { default: { http: [cfg.arc.rpcUrl] } },
    blockExplorers: { default: { name: 'ArcScan', url: cfg.arc.explorerUrl } },
  })
  const transport = http(cfg.arc.rpcUrl)
  const wallet = createWalletClient({ account, chain, transport })
  const publicClient = createPublicClient({ chain, transport })
  const hash = await wallet.deployContract({
    abi: compiled.abi,
    bytecode: compiled.bytecode,
    args: [ownerAddress],
  })
  await onSubmitted?.(hash)
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (!receipt.contractAddress) throw new AppError(500, 'Arc contract deployed but no contract address was returned.')
  return {
    contractAddress: receipt.contractAddress,
    deployTxHash: hash,
    explorerUrl: `${cfg.arc.explorerUrl}/address/${receipt.contractAddress}`,
    abi: compiled.abi,
    sourceCode: compiled.sourceCode,
    contractName: compiled.contractName,
  }
}
