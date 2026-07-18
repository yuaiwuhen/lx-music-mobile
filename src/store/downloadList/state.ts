export interface InitState {
  list: LX.Download.ListItem[]
  activeTaskIds: Set<string>
}

const state: InitState = {
  list: [],
  activeTaskIds: new Set(),
}

export default state
