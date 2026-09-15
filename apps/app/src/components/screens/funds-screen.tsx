import { PlusIcon } from '@phosphor-icons/react'
import { match } from 'ts-pattern'
import { FundCard } from '@/components/fund-card'
import { withProviders } from '@/components/providers'
import { TabBar } from '@/components/tab-bar'
import { Card, LinkButton, Loading } from '@/components/ui'
import { useFundsQuery } from '@/lib/client/queries'
import { useSession } from '@/lib/client/session'

function Funds() {
  const session = useSession()
  const funds = useFundsQuery({ enabled: session.ready })

  if (!session.ready) return <Loading />

  const content = match(funds)
    .with({ isPending: true }, () => <Loading />)
    .when(
      ({ data }) => Boolean(data?.length),
      ({ data }) => (
        <div className="flex flex-col gap-3">
          {data?.map((fund) => (
            <FundCard key={fund.id} fund={fund} />
          ))}
        </div>
      ),
    )
    .otherwise(() => (
      <Card className="flex flex-col gap-3 p-5">
        <h2 className="font-sans text-lg font-medium">No funds yet</h2>
        <p className="text-[15px] leading-[1.45] text-stone">
          A fund is money set aside for someone, locked until a date you choose. Share the link and
          the whole family can add to it.
        </p>
        <LinkButton href="/funds/new" variant="soft" size="md">
          Start a fund
        </LinkButton>
      </Card>
    ))

  return (
    <div className="flex min-h-dvh flex-col">
      <div className="flex flex-1 flex-col gap-5 px-5 pt-6 pb-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="font-sans text-[28px] leading-[1.1] font-medium tracking-[-0.02em]">
            Funds
          </h1>
          <LinkButton href="/funds/new" size="sm">
            <PlusIcon className="size-4" />
            Start a fund
          </LinkButton>
        </div>

        {content}
      </div>
      <TabBar active="/funds" />
    </div>
  )
}

export default withProviders(Funds)
