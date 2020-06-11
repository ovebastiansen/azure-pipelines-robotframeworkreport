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

function uploadResultsJson (reportDirPath) {
    const jobName = dashify(tl.getVariable('Agent.JobName'))
    const stageName = dashify(tl.getVariable('System.StageDisplayName'))
    const stageAttempt = tl.getVariable('System.StageAttempt')
    const tabName = tl.getInput('tabName', false ) || 'RobotFramework'
    const uniqueId = hat()

    const properties = {
      name:  `${tabName}.${jobName}.${stageName}.${stageAttempt}.${uniqueId}`,
      type: 'robotframework.report'
    }

    const combinedPath = path.join(reportDirPath, 'report.html')
    if (fs.existsSync(combinedPath)) {
      tl.debug("adding report " + combinedPath)
      tl.command('task.addattachment', properties, combinedPath)
    } else {
      throw new Error('Could not find report file ' + combinedPath)
    }
    const uniqueLogId = hat()
    const logProperties = {
      name:  `${tabName}.${jobName}.${stageName}.${stageAttempt}.${uniqueLogId}`,
      type: 'robotframework.log'
    }

    const combinedLogPath = path.join(reportDirPath, 'log.html')
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
    tl.debug(reportDirPath)

    if(fs.existsSync(reportDirPath)) {
      uploadScreenshots(reportDirPath)
      uploadResultsJson(reportDirPath)
    } else {
      throw new Error('Could not find Robotframework report directory')
    }
  } catch (err) {
    tl.warning(err)
    tl.setResult(tl.TaskResult.SucceededWithIssues)
  }
}

run()