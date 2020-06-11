const fs = require('fs')
const path = require('path')
const tl = require('azure-pipelines-task-lib/task')
const globby = require('globby')
const hat = require('hat')
const dashify = require('dashify')

function uploadScreenshots (reportDirPath) {
  const files = globby.sync([`${reportDirPath.replace(/\\/g, '/')}`], {expandDirectories: { extensions: ['png'], files: [ '*' ]}})
  files.forEach(file => {
      const screenshotProperties = {
        name: path.basename(file),
        type: 'robotframework.screenshot'
      }
      tl.debug("screenshot: " + file)
      tl.command('task.addattachment', screenshotProperties, file)
  })
}

function uploadResultsJson (reportDirPath, reportFileName, logFileName) {
    const jobName = dashify(tl.getVariable('Agent.JobName'))
    const stageName = dashify(tl.getVariable('System.StageDisplayName'))
    const stageAttempt = tl.getVariable('System.StageAttempt')
    const tabName = tl.getInput('tabName', false ) || 'RobotFrameworkTabName'
    const uniqueId = hat()

    const properties = {
      name:  `${tabName}.${jobName}.${stageName}.${stageAttempt}.report`,
      type: 'robotframework.report'
    }
    tl.debug("checking value before join:" + reportDirPath)
    tl.debug("checking value before join:" + reportFileName)
    const combinedPath = path.join(reportDirPath, reportFileName)
    if (fs.existsSync(combinedPath)) {
      tl.debug("adding report " + combinedPath)
      tl.command('task.addattachment', properties, combinedPath)
    } else {
      throw new Error('Could not find report file ' + combinedPath)
    }
    const uniqueLogId = hat()
    const logProperties = {
      name:  `${tabName}.${jobName}.${stageName}.${stageAttempt}.log`,
      type: 'robotframework.report'
    }

    const combinedLogPath = path.join(reportDirPath, logFileName)
    if (fs.existsSync(combinedLogPath)) {
      tl.debug("adding log " + combinedLogPath)
      tl.command('task.addattachment', logProperties, combinedLogPath)
    } else {
      throw new Error('Could not find log file ' + combinedLogPath)
    }
}

function run () {
  try {
    const reportDirPath = path.resolve(tl.getInput('cwd', true))
    const reportFileName = tl.getInput('reportFileName', false)
    const logFileName = tl.getInput('logFileName', false)
    tl.debug(reportDirPath)

    if(fs.existsSync(reportDirPath)) {
      uploadScreenshots(reportDirPath)
      uploadResultsJson(reportDirPath, reportFileName, logFileName)
    } else {
      throw new Error('Could not find Robotframework report directory')
    }
  } catch (err) {
    tl.warning(err)
    tl.setResult(tl.TaskResult.SucceededWithIssues)
  }
}

run()