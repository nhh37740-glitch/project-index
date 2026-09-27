pipeline {
  agent { label 'media-workspace-agent' }
  parameters { booleanParam(name: 'DEPLOY', defaultValue: false, description: '验证通过后更新项目展示页') }
  options { timeout(time: 30, unit: 'MINUTES'); disableConcurrentBuilds(); timestamps(); buildDiscarder(logRotator(numToKeepStr: '20')) }
  stages {
    stage('Checkout') { steps { checkout scm } }
    stage('Validate') { steps { sh 'python3 deploy/validate.py' } }
    stage('Package') { steps { sh 'python3 deploy/package.py'; archiveArtifacts artifacts: 'dist/*.zip', fingerprint: true } }
    stage('Build image') { steps { sh 'sudo docker build --tag project-index:${BUILD_NUMBER} .' } }
    stage('Smoke image') {
      steps {
        sh '''set -eu
          cid=$(sudo docker run -d --rm --read-only --tmpfs /tmp:size=16m --cap-drop ALL --security-opt no-new-privileges --memory 64m --cpus 0.25 -p 127.0.0.1::8080 project-index:${BUILD_NUMBER})
          trap 'sudo docker stop "$cid" >/dev/null 2>&1 || true' EXIT
          port=$(sudo docker port "$cid" 8080/tcp | sed -n 's/.*://p')
          for i in 1 2 3 4 5; do
            if curl -fsS "http://127.0.0.1:$port/" >/dev/null \
                && curl -fsS "http://127.0.0.1:$port/radar/indexbak.html" | grep -qi 'synthetic demo data' \
                && curl -fsS "http://127.0.0.1:$port/radar/data/method_comparison_jan15_cfear_lite_pose_data.js" | grep -q '"synthetic":true'; then
              exit 0
            fi
            sleep 1
          done
          sudo docker logs "$cid"; exit 1'''
      }
    }
    stage('Deploy') {
      when { expression { params.DEPLOY } }
      steps { sh 'bash deploy/deploy.sh project-index:${BUILD_NUMBER}' }
    }
    stage('Public smoke') {
      when { expression { params.DEPLOY } }
      steps { sh 'curl -fsS http://127.0.0.1:8088/projects/ | grep -q "PROJECT INDEX"' }
    }
  }
  post { always { echo "project-index build ${env.BUILD_NUMBER}: ${currentBuild.currentResult}" } }
}
