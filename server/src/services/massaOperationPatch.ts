const waitTimeoutMs = Number(process.env.MASSA_OPERATION_WAIT_TIMEOUT_MS || '300000')
const waitPeriodMs = Number(process.env.MASSA_OPERATION_WAIT_PERIOD_MS || '1000')

try {
  // deweb-cli does not expose the massa-web3 operation wait timeout, so preload
  // this file into the child process and extend the default confirmation wait.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { Operation } = require('@massalabs/massa-web3/dist/cmd/operation/operation')
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { OperationStatus } = require('@massalabs/massa-web3/dist/cmd/operation/types')

  if (Operation?.prototype?.waitFinalExecution && OperationStatus?.Success !== undefined) {
    Operation.prototype.waitFinalExecution = function waitFinalExecution(timeout?: number, period?: number) {
      return this.wait(OperationStatus.Success, timeout ?? waitTimeoutMs, period ?? waitPeriodMs)
    }
    Operation.prototype.waitSpeculativeExecution = function waitSpeculativeExecution(timeout?: number, period?: number) {
      return this.wait(OperationStatus.SpeculativeSuccess, timeout ?? waitTimeoutMs, period ?? waitPeriodMs)
    }
  }
} catch (err) {
  console.warn('[massa-operation-patch] failed to extend operation wait timeout:', err)
}
