const waitTimeoutMs = Number(process.env.MASSA_OPERATION_WAIT_TIMEOUT_MS || '300000')
const waitPeriodMs = Number(process.env.MASSA_OPERATION_WAIT_PERIOD_MS || '1000')

try {
  const { Operation } = require('@massalabs/massa-web3/dist/cmd/operation/operation')
  const { OperationStatus } = require('@massalabs/massa-web3/dist/cmd/operation/types')

  if (Operation?.prototype?.waitFinalExecution && OperationStatus?.Success !== undefined) {
    Operation.prototype.waitFinalExecution = function waitFinalExecution(timeout, period) {
      return this.wait(OperationStatus.Success, timeout ?? waitTimeoutMs, period ?? waitPeriodMs)
    }
    Operation.prototype.waitSpeculativeExecution = function waitSpeculativeExecution(timeout, period) {
      return this.wait(OperationStatus.SpeculativeSuccess, timeout ?? waitTimeoutMs, period ?? waitPeriodMs)
    }
  }
} catch (err) {
  console.warn('[massa-operation-patch] failed to extend operation wait timeout:', err)
}
