-- CreateEnum
CREATE TYPE "MembershipAction" AS ENUM ('joined', 'left', 'removed');

-- CreateTable
CREATE TABLE "OrgMembershipLog" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" "MembershipAction" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrgMembershipLog_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "OrgMembershipLog" ADD CONSTRAINT "OrgMembershipLog_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMembershipLog" ADD CONSTRAINT "OrgMembershipLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrgMembershipLog" ADD CONSTRAINT "OrgMembershipLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
