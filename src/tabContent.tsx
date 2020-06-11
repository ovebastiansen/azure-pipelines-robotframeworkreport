import "./tabContent.scss"

import * as React from "react"
import * as ReactDOM from "react-dom"
import * as SDK from "azure-devops-extension-sdk"

import fetch from "node-fetch"

import { getClient } from "azure-devops-extension-api"
import { ReleaseEnvironment, ReleaseRestClient, ReleaseTaskAttachment } from "azure-devops-extension-api/Release"
import { Build, BuildRestClient, Attachment } from "azure-devops-extension-api/Build"
import { CommonServiceIds, IProjectPageService } from "azure-devops-extension-api"

import { ObservableValue, ObservableObject } from "azure-devops-ui/Core/Observable"
import { Observer } from "azure-devops-ui/Observer"
import { Tab, TabBar, TabSize } from "azure-devops-ui/Tabs"

const ATTACHMENT_TYPE = "robotframework.report";
const ATTACHMENT_LOG_TYPE = "robotframework.log";
const SCREENSHOT_ATTACHMENT_TYPE = "robotframework.screenshot";
const OUR_TASK_IDS = [
  "",
]

SDK.init()
SDK.ready().then(() => {
  try {
    const config = SDK.getConfiguration()
    if (typeof config.onBuildChanged === "function") {
      config.onBuildChanged((build: Build) => {
        let buildAttachmentClient = new BuildAttachmentClient(build)
        buildAttachmentClient.init().then(() => {
          displayReports(buildAttachmentClient)
        }).catch(error => {setError(error)})
      })
    } else if (typeof config.releaseEnvironment === "object") {
      let releaseAttachmentClient = new ReleaseAttachmentClient(config.releaseEnvironment)
      releaseAttachmentClient.init().then(() => {
        displayReports(releaseAttachmentClient)
      }).catch(error => {setError(error)})
    }
  } catch(error) {
    setError(error)
  }
})

function setText (message: string) {
  console.log(message)
  const messageContainer = document.querySelector("#robotframework-ext-message p")
  if (messageContainer) {
    messageContainer.innerHTML = message
  }
  const spinner = document.querySelector(".spinner")

}

function setError (error: Error) {
  setText('Error loading reports')
  console.log(error)
  const spinner = document.querySelector(".spinner") as HTMLElement;
  const errorBadge = document.querySelector('.error-badge') as HTMLElement;
  if (spinner && errorBadge) {
    spinner.style.display = 'none';
    errorBadge.style.display = 'block';
  }
}

function displayReports(attachmentClient: AttachmentClient) {
  const nbAttachments = attachmentClient.getAttachments().length
  if (nbAttachments) {
    ReactDOM.render(<TaskAttachmentPanel attachmentClient={attachmentClient} />, document.getElementById("robotframework-ext-container"))
    document.getElementById("robotframework-ext-message").style.display = "none"
  } else {
    setError(Error("Could not find any report attachment"))
  }
}

SDK.register("registerRelease", {
  isInvisible: function (state) {
    let resultArray = []
    state.releaseEnvironment.deployPhasesSnapshot.forEach(phase => {
      phase.workflowTasks.forEach(task => {
        resultArray.push(task.taskId)
      })
    })
    return !OUR_TASK_IDS.some(id => resultArray.includes(id))
  }
})

interface TaskAttachmentPanelProps {
  attachmentClient: AttachmentClient
}

export default class TaskAttachmentPanel extends React.Component<TaskAttachmentPanelProps> {
  private selectedTabId: ObservableValue<string>
  private tabContents: ObservableObject<string>
  private tabInitialContent: string = '<div class="wide"><p>Loading...</p></div>'

  constructor(props: TaskAttachmentPanelProps) {
    super(props);
    this.selectedTabId = new ObservableValue(props.attachmentClient.getAttachments()[0].name)
    this.tabContents = new ObservableObject()
  }

  public componentDidMount() {
    // const config = SDK.getConfiguration()
    // SDK.notifyLoadSucceeded().then(() => {
    //     SDK.resize()
    // });
  }

  public escapeHTML(str: string) {
    return str.replace(/[&<>'"]/g, tag => ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          "'": '&#39;',
          '"': '&quot;'
        }[tag] || tag))
  }

  public render() {
    const attachments = this.props.attachmentClient.getAttachments()
    if (attachments.length == 0) {
      return (null)
    } else {
      const tabs = []
      for (const attachment of attachments) {
        const metadata = attachment.name.split('.')
        // Conditionally add counter for multistage pipeline
        const name = metadata[2] !== '__default' ? `${metadata[0]} #${metadata[3]}` : metadata[0]
        console.log(name)
        tabs.push(<Tab name={name} id={attachment.name} key={attachment.name} url={attachment._links.self.href}/>)
        this.tabContents.add(attachment.name, this.tabInitialContent)
      }
      return (
        <div className="flex-column">
          { attachments.length > 1 ?
            <TabBar
              onSelectedTabChanged={this.onSelectedTabChanged}
              selectedTabId={this.selectedTabId}
              tabSize={TabSize.Tall}>
              {tabs}
            </TabBar>
          : null }
          <Observer selectedTabId={this.selectedTabId} tabContents={this.tabContents}>
            {(props: { selectedTabId: string }) => {
              if ( this.tabContents.get(props.selectedTabId) === this.tabInitialContent) {
                this.props.attachmentClient.getAttachmentContent(props.selectedTabId).then((content) => {
                  this.tabContents.set(props.selectedTabId, '<iframe class="wide" srcdoc="' + this.escapeHTML(content) + '"></iframe>')
                }).catch(error => {
                  this.tabContents.set(props.selectedTabId, '<div class="wide"><p>Error loading report:<br/>' + error + '</p></div>')
                  setError(error)
                })
              }
              return  <span dangerouslySetInnerHTML={ {__html: this.tabContents.get(props.selectedTabId)} } />
            }}
          </Observer>
        </div>
      );
    }
  }

  private onSelectedTabChanged = (newTabId: string) => {
    this.selectedTabId.value = newTabId;
  }
}

abstract class AttachmentClient {
  protected attachments: Attachment[]  | ReleaseTaskAttachment[] = []
  protected authHeaders: Object = undefined
  protected reportHtmlContent: string = undefined
  protected appJsContent: string = undefined
  constructor() {}

  async loadReportTemplates() {
    // console.log('Get report templates')
    // const response = await fetch('./report.html')
    // this.reportHtmlContent = await response.text()
    // const appJs = await fetch('./app.js')
    // this.appJsContent = await appJs.text()
  }

  // Retrieve attachments and attachment contents from AzDO
  abstract async init(): Promise<void>

  public getAttachments() : Attachment[]  | ReleaseTaskAttachment[] {
    return this.attachments
  }

  public getDownloadableAttachment(attachmentName: string): Attachment | ReleaseTaskAttachment {
    const attachment = this.attachments.find((attachment) => { return attachment.name === attachmentName})
    if (!(attachment && attachment._links && attachment._links.self && attachment._links.self.href)) {
      throw new Error("Attachment " + attachmentName + " is not downloadable")
    }
    return attachment
  }

  abstract async getScreenshotAttachments(): Promise<Attachment[] | ReleaseTaskAttachment[]>

  public async getAttachmentContent(attachmentName: string): Promise<string> {
    setText('Looking for Report File')
    if (this.authHeaders === undefined) {
      console.log('Get access token')
      const accessToken = await SDK.getAccessToken()
      const b64encodedAuth = Buffer.from(':' + accessToken).toString('base64')
      this.authHeaders = { headers: {'Authorization': 'Basic ' + b64encodedAuth} }
    }
    console.log("Get " + attachmentName + " attachment content")
    const attachment = this.getDownloadableAttachment(attachmentName)
    const response = await fetch(attachment._links.self.href, this.authHeaders)
    if (!response.ok) {
      throw new Error(response.statusText)
    }
    
    setText('Processing Report File')
    var responseText = await response.text()
    //console.log(responseText)

    const screenshots = await this.getScreenshotAttachments()
    if (screenshots.length > 0) {
      
      screenshots.forEach(screenshot => {
        var orgLink = "<img src=\\\"" + screenshot.name;
        var newLink = "<img src=\\\"" + screenshot._links.self.href;
        //var found = responseText.indexOf(orgLink);
        //console.log("found image src " + found);
        responseText = responseText.replace(orgLink, newLink);

        var orgHref = "<a href=\\\"" + screenshot.name;
        var newHref = "<a href=\\\"" + screenshot._links.self.href;

        //var found = responseText.indexOf(orgLink);
        //console.log("found image src " + found);
        responseText = responseText.replace(orgHref, newHref);

        //const tc = responseText.find((x) => x.screenShotFile.includes(screenshot.name))
        //if (tc) {
        //  tc.screenShotFile = screenshot._links.self.href
        //}
      })
    }
    //console.log(responseText)
    

    // const contentJSON = JSON.parse(JSON.parse(responseText))
    
    // mustache.tags =  [ '<%', '%>' ];
    // mustache.escape = function(text) { return text }
    // const renderedApp = mustache.render(this.appJsContent, {resultJSON: JSON.stringify(contentJSON)})
    // const renderedReportHtml = mustache.render(this.reportHtmlContent, { appJsScript: renderedApp })
    return responseText
  }
}

class BuildAttachmentClient extends AttachmentClient {
  private build: Build

  constructor(build: Build) {
    super()
    this.build = build
  }

  public async init() {
    //await this.loadReportTemplates()
    console.log('Get attachment list')
    const buildClient: BuildRestClient = getClient(BuildRestClient)
    var reportattachments = await buildClient.getAttachments(this.build.project.id, this.build.id, ATTACHMENT_TYPE)
    var logattachments = await buildClient.getAttachments(this.build.project.id, this.build.id, ATTACHMENT_LOG_TYPE)
    this.attachments = reportattachments.concat(logattachments);
  }

  public async getScreenshotAttachments(): Promise<Attachment[]> {
    console.log('Get screenshot list')
    const buildClient: BuildRestClient = getClient(BuildRestClient)
    return await buildClient.getAttachments(this.build.project.id, this.build.id, SCREENSHOT_ATTACHMENT_TYPE)
  }
}

class ReleaseAttachmentClient extends AttachmentClient {
  private releaseEnvironment: ReleaseEnvironment
  private projectId
  private deployStepAttempt
  private runPlanId

  constructor(releaseEnvironment: ReleaseEnvironment) {
    super()
    this.releaseEnvironment = releaseEnvironment
  }

  public async init() {
    await this.loadReportTemplates()
    const releaseId = this.releaseEnvironment.releaseId
    const environmentId = this.releaseEnvironment.id
    console.log('Get project')
    const projectService = await SDK.getService<IProjectPageService>(CommonServiceIds.ProjectPageService)
    const project = await projectService.getProject()
    console.log('Get release')
    const releaseClient: ReleaseRestClient = getClient(ReleaseRestClient)
    const release = await releaseClient.getRelease(project.id, releaseId)
    const env = release.environments.filter((e) => e.id === environmentId)[0]

    if (!(env.deploySteps && env.deploySteps.length)) {
      throw new Error("This release has not been deployed yet")
    }

    const deployStep = env.deploySteps[env.deploySteps.length - 1]
    if (!(deployStep.releaseDeployPhases && deployStep.releaseDeployPhases.length)) {
      throw new Error("This release has no job");
    }

    const runPlanIds = deployStep.releaseDeployPhases.map((phase) => phase.runPlanId)
    if (!runPlanIds.length) {
      throw new Error("There are no plan IDs");
    } else {
      searchForRunPlanId: {
        for (const phase of deployStep.releaseDeployPhases) {
          for (const deploymentJob of phase.deploymentJobs) {
            for (const task of deploymentJob.tasks){
              if (OUR_TASK_IDS.includes(task.task?.id)) {
                this.runPlanId = phase.runPlanId;
                break searchForRunPlanId
              }
            }
          }
        }
      }
    }
    this.projectId = project.id
    this.deployStepAttempt = deployStep.attempt
    console.log('Get attachment list')
    this.attachments = await releaseClient.getReleaseTaskAttachments(project.id, releaseId, environmentId, deployStep.attempt, this.runPlanId, ATTACHMENT_TYPE)
    if (this.attachments.length === 0) {
      throw new Error("There is no attachment")
    }
    if (this.attachments.length >1) {
      throw new Error("There is more than a single attachment, this is not expected")
    }
  }

  public async getScreenshotAttachments(): Promise<ReleaseTaskAttachment[]> {
    console.log('Get screenshot list')
    const releaseClient: ReleaseRestClient = getClient(ReleaseRestClient)
    return await releaseClient.getReleaseTaskAttachments(this.projectId, this.releaseEnvironment.releaseId, this.releaseEnvironment.id, this.deployStepAttempt, this.runPlanId, SCREENSHOT_ATTACHMENT_TYPE)
  }

}
