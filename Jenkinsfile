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
                && ! curl -fsS "http://127.0.0.1:$port/radar/" >/dev/null; then
              exit 0
            fi
            sleep 1
          done
          sudo docker logs "$cid"; exit 1'''
      }
    }
    stage('Deploy') {
      when { expression { params.DEPLOY } }
      steps {
        sh '''set -eu
          bash deploy/install-nginx-route.sh
          bash deploy/deploy.sh project-index:${BUILD_NUMBER}
        '''
      }
    }
    stage('Public smoke') {
      when { expression { params.DEPLOY } }
      steps {
        sh '''set -eu
          site="$(curl -fsS http://127.0.0.1:8088/projects/)"
          printf '%s' "$site" | grep -q 'PROJECT INDEX'
          printf '%s' "$site" | grep -q 'href="./apps/go/"'
          printf '%s' "$site" | grep -q 'href="./apps/java/agent.html"'
          printf '%s' "$site" | grep -q 'href="./apps/cpp/"'
          printf '%s' "$site" | grep -q 'href="./radar/"'
          printf '%s' "$site" | grep -q 'Oxford RobotCar'
          printf '%s' "$site" | grep -q '不在浏览器中运行模型推理'
          printf '%s' "$site" | grep -q '模型未配置'
          printf '%s' "$site" | grep -q '不运行推理'
          if printf '%s' "$site" | grep -Eq '推理可用|在线推理'; then
            echo 'C++ must not be advertised as an available inference demo' >&2
            exit 1
          fi

          go_page="$(curl -fsS http://127.0.0.1:8088/projects/apps/go/)"
          printf '%s' "$go_page" | grep -q 'projects/apps/go/api/'
          java_page="$(curl -fsS http://127.0.0.1:8088/projects/apps/java/agent.html)"
          printf '%s' "$java_page" | grep -Fq "new URL('api', window.location.href)"
          if printf '%s' "$java_page" | grep -Eiq 'https?://localhost(:[0-9]+)?/api'; then
            echo 'Java demo still contains a browser-facing localhost API URL' >&2
            exit 1
          fi

          if ! java_api_status="$(curl -sS -o /dev/null -w '%{http_code}' \
              http://127.0.0.1:8088/projects/apps/java/api/chat 2>/dev/null)"; then
            echo 'Java API proxy could not connect to its upstream' >&2
            exit 1
          fi
          case "$java_api_status" in
            000|404|502)
              echo "Java API proxy did not reach its upstream (HTTP $java_api_status)" >&2
              exit 1
              ;;
          esac

          cpp_page="$(curl -fsS http://127.0.0.1:8088/projects/apps/cpp/)"
          printf '%s' "$cpp_page" | grep -q 'projects/apps/cpp/api/state'
          cpp_state="$(curl -fsS http://127.0.0.1:8088/projects/apps/cpp/api/state)"
          printf '%s' "$cpp_state" | python3 -c 'import json,sys; s=json.load(sys.stdin); assert s.get("run_state") == "waiting_config", s; assert s.get("events") == [], s; assert "未运行推理" in s.get("run_detail", ""), s'

          radar_page="$(curl -fsS http://127.0.0.1:8088/projects/radar/)"
          printf '%s' "$radar_page" | grep -Fq '2019-01-15-13-06-37'
          printf '%s' "$radar_page" | grep -Fq 'CC BY-NC-SA 4.0'
          printf '%s' "$radar_page" | grep -Fq '不在浏览器中运行模型推理'
          curl -fsS http://127.0.0.1:8088/projects/radar/app.js >/dev/null
          curl -fsS http://127.0.0.1:8088/projects/radar/assets/radar/1547557604078984.jpg >/dev/null
          curl -fsS http://127.0.0.1:8088/projects/radar/assets/stereo/1547557604081434.jpg >/dev/null
        '''
      }
    }
  }
  post { always { echo "project-index build ${env.BUILD_NUMBER}: ${currentBuild.currentResult}" } }
}
