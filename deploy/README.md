# EC2 배포 (CI/CD)

`main`에 머지되면 `.github/workflows/ci-cd.yml`이 백엔드 테스트·프론트 빌드를 통과한 뒤, **SSM Run Command**로 EC2에서 `deploy/setup.sh <커밋 SHA> <HOST>`를 실행합니다. SSH 포트(22)는 GitHub에 열지 않고, AWS 키도 GitHub에 저장하지 않습니다(OIDC 역할).

PR에는 테스트·빌드만 돌고 배포는 하지 않습니다. 수동 재배포는 Actions 탭 → CI/CD → Run workflow(main).

## 최초 1회 설정 (AWS CloudShell)

최초 배포 때 만든 `~/dolbomeum.vars`(IID, HOST 등)를 그대로 씁니다.

```bash
source ~/dolbomeum.vars
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
REPO=p-rebel/Dolbom-eum

# 1) EC2에 SSM 권한(인스턴스 프로파일) 부여
aws iam create-role --role-name $NAME-ec2 --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"ec2.amazonaws.com"},"Action":"sts:AssumeRole"}]}'
aws iam attach-role-policy --role-name $NAME-ec2 --policy-arn arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore
aws iam create-instance-profile --instance-profile-name $NAME-ec2
aws iam add-role-to-instance-profile --instance-profile-name $NAME-ec2 --role-name $NAME-ec2
sleep 10; aws ec2 associate-iam-instance-profile --instance-id $IID --iam-instance-profile Name=$NAME-ec2

# 2) GitHub Actions OIDC 공급자 (계정에 이미 있으면 EntityAlreadyExists — 무시)
aws iam create-open-id-connect-provider --url https://token.actions.githubusercontent.com --client-id-list sts.amazonaws.com

# 3) GitHub 배포 역할: 이 저장소의 production 환경에서만 맡을 수 있고, 이 인스턴스에만 명령 가능
aws iam create-role --role-name $NAME-github-deploy --assume-role-policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Federated\":\"arn:aws:iam::$ACCOUNT:oidc-provider/token.actions.githubusercontent.com\"},\"Action\":\"sts:AssumeRoleWithWebIdentity\",\"Condition\":{\"StringEquals\":{\"token.actions.githubusercontent.com:aud\":\"sts.amazonaws.com\",\"token.actions.githubusercontent.com:sub\":\"repo:$REPO:environment:production\"}}}]}"
aws iam put-role-policy --role-name $NAME-github-deploy --policy-name ssm-deploy --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":\"ssm:SendCommand\",\"Resource\":[\"arn:aws:ec2:$AWS_REGION:$ACCOUNT:instance/$IID\",\"arn:aws:ssm:$AWS_REGION::document/AWS-RunShellScript\"]},{\"Effect\":\"Allow\",\"Action\":\"ssm:GetCommandInvocation\",\"Resource\":\"*\"}]}"

# 4) 확인: 몇 분 뒤 Online이 나와야 함 (안 나오면 sudo snap restart amazon-ssm-agent)
aws ssm describe-instance-information --filters Key=InstanceIds,Values=$IID --query 'InstanceInformationList[0].PingStatus' --output text
echo "AWS_DEPLOY_ROLE_ARN=arn:aws:iam::$ACCOUNT:role/$NAME-github-deploy  EC2_INSTANCE_ID=$IID  DEPLOY_HOST=$HOST"
```

## GitHub 설정

저장소 Settings → Environments → `production` 생성 (원하면 Required reviewers로 배포 승인 추가) 후 그 환경에:

| 종류 | 이름 | 값 |
|---|---|---|
| Secret | `AWS_DEPLOY_ROLE_ARN` | 위 마지막 줄 출력 |
| Variable | `EC2_INSTANCE_ID` | 위 마지막 줄 출력 |
| Variable | `DEPLOY_HOST` | `54-180-177-190.sslip.io` |

## 주의

- 배포마다 `setup.sh`가 DB를 백업(`/var/lib/dolbomeum/backups`)한 뒤 `init`·`seed`·`load-nhis`를 다시 실행합니다(최초 배포와 같은 동작).
- 시연 비밀번호는 서버의 `/etc/dolbomeum/seed.env`에만 있고 CI는 건드리지 않습니다.
- 배포 로그: 서버 `/var/lib/dolbomeum/deploy.log`, 또는 Actions 실행 로그(SSM 출력 끝 4000자).
