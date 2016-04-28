import React from 'react'
import { connect } from 'react-redux'
import { incrementScore } from '../actions/actionCreators'

let showScore = ({dispatch, onClick}) => {
  function handleClick() {
    store.dispatch(incrementScore(1));
  }
  return (
    <div>
      <button onClick={handleClick}>Click Here</button>
      <div>Hey</div>
    </div>
  )
}

// showScore = connect()(showScore)

export default showScore