export interface IActivityLike {
  id: string
  type: 'Note' | 'Post'
  created: string
  ref: {
    id: string
    title: string
  }
}
