const score = (state = {}, action) => {
  switch (action.type) {
    case 'INCREMENT_SCORE':
      // return Object.assign({}, state, {
      //   score: action.num
      // })
      return {
        ...state,
        score: action.num
      }
    default:
      return state;
  }
}

export default score
