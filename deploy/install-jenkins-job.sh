#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
jenkins_url=http://127.0.0.1:8081
env_file=/opt/media-workspace/config/media-workspace.env
java_bin=/usr/lib/jvm/java-21-openjdk-amd64/bin/java
tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT
chmod 0700 "$tmp_dir"

if [ ! -r "$env_file" ]; then echo "Jenkins credential source is unavailable" >&2; exit 1; fi
# Existing Jenkins setup owns these credentials. Never print them or store them in this repository.
set -a
# shellcheck disable=SC1090
. "$env_file"
set +a
: "${JENKINS_ADMIN_USER:?}"
: "${JENKINS_ADMIN_PASSWORD:?}"
printf '%s:%s\n' "$JENKINS_ADMIN_USER" "$JENKINS_ADMIN_PASSWORD" > "$tmp_dir/auth"
chmod 0600 "$tmp_dir/auth"
unset JENKINS_ADMIN_PASSWORD
curl -fsS "$jenkins_url/jnlpJars/jenkins-cli.jar" -o "$tmp_dir/jenkins-cli.jar"

cat > "$tmp_dir/job.xml" <<XML
<?xml version='1.1' encoding='UTF-8'?>
<flow-definition plugin="workflow-job">
  <description>Project Index static release, Docker image, and opt-in deployment.</description>
  <keepDependencies>false</keepDependencies>
  <properties><org.jenkinsci.plugins.workflow.job.properties.DisableConcurrentBuildsJobProperty/></properties>
  <definition class="org.jenkinsci.plugins.workflow.cps.CpsScmFlowDefinition" plugin="workflow-cps">
    <scm class="hudson.plugins.git.GitSCM" plugin="git">
      <configVersion>2</configVersion>
      <userRemoteConfigs><hudson.plugins.git.UserRemoteConfig><url>${repo_root}</url></hudson.plugins.git.UserRemoteConfig></userRemoteConfigs>
      <branches><hudson.plugins.git.BranchSpec><name>*/main</name></hudson.plugins.git.BranchSpec></branches>
      <doGenerateSubmoduleConfigurations>false</doGenerateSubmoduleConfigurations>
    </scm>
    <scriptPath>Jenkinsfile</scriptPath><lightweight>false</lightweight>
  </definition>
  <triggers/><disabled>false</disabled>
</flow-definition>
XML

cli=("$java_bin" -jar "$tmp_dir/jenkins-cli.jar" -s "$jenkins_url" -http -auth "@$tmp_dir/auth")
if "${cli[@]}" get-job project-index >/dev/null 2>&1; then
  "${cli[@]}" update-job project-index < "$tmp_dir/job.xml"
  echo 'updated Jenkins job project-index'
else
  "${cli[@]}" create-job project-index < "$tmp_dir/job.xml"
  echo 'created Jenkins job project-index'
fi
